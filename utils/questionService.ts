import { supabase } from './supabase';

export interface CreateQuestionInput {
  question: string;
}

export async function createQuestionForPost(postId: string, input: CreateQuestionInput) {
  const q = input.question.trim();
  if (!q) throw new Error('Question is required');
  if (q.length > 140) throw new Error('Question is too long');

  const { error } = await supabase.from('post_questions').insert({
    post_id: postId,
    question: q,
  });
  if (error) throw new Error(error.message);
}

export async function addAnswer(postId: string, answer: string) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('Login required');

  const trimmed = answer.trim();
  if (!trimmed) throw new Error('Answer is required');
  if (trimmed.length > 240) throw new Error('Answer is too long');

  const { error } = await supabase.from('post_question_answers').insert({
    post_id: postId,
    user_id: user.id,
    answer: trimmed,
  });
  if (error) throw new Error(error.message);
}

