import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Add locked_at column to post_polls table if it doesn't exist
 * This migration should be run once to add the manual lock feature
 */
export async function addPollLockColumn(): Promise<boolean> {
  try {
    // First, check if the column already exists by trying to query it
    const { error: checkError } = await supabase
      .from('post_polls')
      .select('locked_at')
      .limit(1);

    // If no error, the column exists
    if (!checkError) {
      log('[addPollLockColumn] locked_at column already exists');
      return true;
    }

    // If error indicates column doesn't exist, try to add it
    if (checkError && checkError.message?.includes('locked_at')) {
      log('[addPollLockColumn] Column missing, attempting to add...');
      
      // Try using execute_sql RPC (if available)
      const { error: rpcError } = await supabase.rpc('execute_sql', {
        sql: `
          ALTER TABLE public.post_polls 
          ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;
        `
      });

      if (!rpcError) {
        log('[addPollLockColumn] Successfully added locked_at column via RPC');
        return true;
      }

      // If RPC doesn't work, try exec_sql (alternative name)
      const { error: execError } = await supabase.rpc('exec_sql', {
        sql: `
          ALTER TABLE public.post_polls 
          ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;
        `
      });

      if (!execError) {
        log('[addPollLockColumn] Successfully added locked_at column via exec_sql');
        return true;
      }

      error('[addPollLockColumn] Could not add column via RPC. Error:', rpcError || execError);
      log('[addPollLockColumn] Please run this SQL manually in Supabase SQL Editor:');
      log('ALTER TABLE public.post_polls ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;');
      return false;
    }

    // Some other error occurred
    error('[addPollLockColumn] Unexpected error checking column:', checkError);
    return false;
  } catch (error) {
    error('[addPollLockColumn] Exception:', error);
    log('[addPollLockColumn] Please run this SQL manually in Supabase SQL Editor:');
    log('ALTER TABLE public.post_polls ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;');
    return false;
  }
}

export interface CreatePollInput {
  question: string;
  options: string[]; // 2-6
  expiresAt?: string | null; // ISO
  showResultsMode?: 'after_vote' | 'after_expiry' | 'always';
}

export async function createPollForPost(postId: string, input: CreatePollInput) {
  const question = input.question.trim();
  const opts = input.options.map(s => s.trim()).filter(Boolean);
  if (!question) throw new Error('Poll question is required');
  if (opts.length < 2 || opts.length > 6) throw new Error('Poll must have 2–6 options');

  const { error: pollError } = await supabase.from('post_polls').insert({
    post_id: postId,
    question,
    expires_at: input.expiresAt ?? null,
    show_results_mode: input.showResultsMode ?? 'after_vote',
  });
  if (pollError) throw new Error(pollError.message);

  const optionRows = opts.map((text, idx) => ({
    post_id: postId,
    option_text: text.slice(0, 60),
    sort_order: idx,
  }));
  const { error: optionsError } = await supabase.from('post_poll_options').insert(optionRows);
  if (optionsError) throw new Error(optionsError.message);
}

export async function castMyVoteOnce(postId: string, optionId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('Login required');

  // Check if poll is locked
  const { data: poll, error: pollError } = await supabase
    .from('post_polls')
    .select('locked_at')
    .eq('post_id', postId)
    .maybeSingle();

  if (pollError) {
    throw new Error(pollError.message);
  }

  if (poll?.locked_at) {
    throw new Error('Poll is locked. Voting has ended.');
  }

  // IMPORTANT: Vote is final. Second attempt should fail with unique (post_id,user_id).
  const { error } = await supabase.from('post_poll_votes').insert({
    post_id: postId,
    option_id: optionId,
    user_id: user.id,
  });

  if (error) {
    // Supabase/Postgres unique violation
    if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
      throw new Error('Vote locked. You already voted.');
    }
    throw new Error(error.message);
  }
}

/**
 * Lock a poll manually (only post creator can do this)
 * This prevents fraud by allowing the creator to close voting at any time
 */
export async function lockPoll(postId: string, userId: string): Promise<boolean> {
  try {
    // Verify user is the post creator
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .maybeSingle();

    if (postError || !post) {
      throw new Error('Post not found');
    }

    if (post.user_id !== userId) {
      throw new Error('Only the post creator can lock the poll');
    }

    // Lock the poll by setting locked_at timestamp
    const { error } = await supabase
      .from('post_polls')
      .update({ locked_at: new Date().toISOString() })
      .eq('post_id', postId);

    if (error) {
      throw new Error(error.message);
    }

    return true;
  } catch (error: any) {
    error('[lockPoll] Error:', error);
    throw error;
  }
}

