import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { addAnswer } from '../utils/questionService';

type ThemeColors = any;

export function QuestionPostCard({
  postId,
  themeColors,
  question,
  onAnswered,
}: {
  postId: string;
  themeColors: ThemeColors;
  question: {
    question: string;
    answers_count: number;
    my_has_answered?: boolean;
    top_answers: Array<{
      id: string;
      user_id: string;
      answer: string;
      created_at: string;
      user?: { username?: string; full_name?: string; avatar_url?: string | null; is_verified?: boolean };
    }>;
  };
  onAnswered?: () => void;
}) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const answersCount = question.answers_count || 0;
  const top = useMemo(() => (question.top_answers || []).slice(0, 2), [question.top_answers]);

  return (
    <View style={[styles.card, { borderColor: themeColors.border, backgroundColor: themeColors.cardBackground }]}>
      <Text style={[styles.badge, { color: themeColors.primary.main }]}>❓ Q&A</Text>
      <Text style={[styles.question, { color: themeColors.text }]}>{question.question}</Text>

      {top.length > 0 && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {top.map((a) => (
            <View key={a.id} style={[styles.answerRow, { borderColor: themeColors.border }]}>
              <Text style={[styles.answerText, { color: themeColors.text }]} numberOfLines={3}>
                {a.answer}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
          {answersCount} answer{answersCount === 1 ? '' : 's'}
        </Text>
        <TouchableOpacity
          onPress={() => setShow(true)}
          activeOpacity={0.85}
          style={[styles.cta, { backgroundColor: themeColors.primary.main }]}
        >
          <Text style={styles.ctaText}>{question.my_has_answered ? 'Add another' : 'Answer'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Your answer</Text>
            <Text style={[styles.modalQuestion, { color: themeColors.textSecondary }]} numberOfLines={2}>
              {question.question}
            </Text>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a short answer…"
              placeholderTextColor={themeColors.textSecondary}
              style={[
                styles.input,
                { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.neutral?.background || 'transparent' },
              ]}
              multiline
              maxLength={240}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => setShow(false)} activeOpacity={0.8} style={[styles.btn, { borderColor: themeColors.border }]}>
                <Text style={[styles.btnText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={submitting || !text.trim()}
                onPress={async () => {
                  try {
                    setSubmitting(true);
                    await addAnswer(postId, text);
                    Toast.show({ type: 'success', text1: 'Answer posted' });
                    setText('');
                    setShow(false);
                    onAnswered?.();
                  } catch (e: any) {
                    Toast.show({ type: 'error', text1: e?.message || 'Failed to answer' });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                activeOpacity={0.85}
                style={[
                  styles.btnPrimary,
                  { backgroundColor: themeColors.primary.main, opacity: submitting || !text.trim() ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.btnPrimaryText}>{submitting ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  answerRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  answerText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
  },
  cta: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalQuestion: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnText: {
    fontWeight: '800',
    fontSize: 13,
  },
  btnPrimary: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
});

