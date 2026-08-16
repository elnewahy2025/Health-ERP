import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Star, Send, Heart, MessageSquare } from 'lucide-react';
import { Button, Spinner } from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';

interface SurveyQuestion {
  id: string;
  text: string;
  type: 'rating' | 'text' | 'choice';
  options?: string[];
  required: boolean;
}

interface Survey {
  id: string;
  name: string;
  type: string;
  questions: SurveyQuestion[];
}

type Step = 'intro' | 'questions' | 'thankyou';

export default function PostVisitSurveyPage() {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('intro');
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/surveys/active');
        const active = res.data.data?.[0];
        if (active && !cancelled) setSurvey(active);
      } catch {
        /* no survey */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const validateAnswers = useCallback((): boolean => {
    if (!survey) return false;
    const errors: Record<string, string> = {};
    for (const q of survey.questions) {
      if (q.required && !answers[q.id]) {
        errors[q.id] = t('survey.requiredQuestion');
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [survey, answers, t]);

  const handleSubmit = useCallback(async () => {
    if (!survey) return;
    if (!validateAnswers()) return;
    setSubmitting(true);
    try {
      await api.post(`/surveys/${survey.id}/respond`, {
        tenantSlug: localStorage.getItem('tenantSlug') || undefined,
        responses: answers,
        patientComment: sanitizeString(comment) || undefined,
      });
      setStep('thankyou');
    } catch {
      toast.error(t('survey.submissionFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [survey, answers, comment, t, validateAnswers]);

  const renderStars = useCallback(
    (qId: string) => {
      const val = (answers[qId] as number) || 0;
      return (
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => {
                setAnswers((prev) => ({ ...prev, [qId]: star }));
                if (validationErrors[qId]) {
                  setValidationErrors((prev) => {
                    const next = { ...prev };
                    delete next[qId];
                    return next;
                  });
                }
              }}
              className="min-w-[48px] min-h-[48px] focus:outline-none transition-transform hover:scale-110"
              type="button"
            >
              <Star
                className={`w-10 h-10 ${
                  star <= val ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>
      );
    },
    [answers, validationErrors],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 dark:bg-gray-900 dark:border-gray-800 max-w-md w-full text-center">
          <Heart className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">{t('survey.title')}</h1>
          <p className="text-gray-500 mb-8">{t('survey.subtitle')}</p>
          <button
            onClick={() => setStep('questions')}
            className="bg-blue-600 text-white w-full py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors min-h-[56px]"
          >
            {t('survey.startFeedback')}
          </button>
          <p className="text-xs text-gray-400 mt-4">{t('survey.anonymousNote')}</p>
        </div>
      </div>
    );
  }

  if (step === 'thankyou') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 dark:bg-gray-900 dark:border-gray-800 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('survey.thankYou')}</h1>
          <p className="text-gray-500 mb-6">{t('survey.thankYouMessage')}</p>
          <button
            onClick={() => window.close()}
            className="bg-green-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors min-h-[48px]"
          >
            {t('survey.close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-md mx-auto py-8">
        <div className="bg-white rounded-3xl shadow-xl p-8 dark:bg-gray-900 dark:border-gray-800">
          <h1 className="text-2xl font-bold mb-2">
            {survey?.name || t('survey.visitFeedback')}
          </h1>
          <p className="text-gray-500 mb-6">{t('survey.rateExperience')}</p>

          <div className="space-y-8">
            {survey?.questions?.map((q) => (
              <div key={q.id}>
                <p className="font-medium mb-3 text-lg text-center">
                  {sanitizeString(q.text)}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </p>
                {q.type === 'rating' && renderStars(q.id)}
                {q.type === 'text' && (
                  <div>
                    <textarea
                      className="w-full border rounded-xl p-4 h-28 text-base text-base"
                      placeholder={t('survey.feedbackPlaceholder')}
                      value={(answers[q.id] as string) || ''}
                      onChange={(e) => {
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                        if (validationErrors[q.id]) {
                          setValidationErrors((prev) => {
                            const next = { ...prev };
                            delete next[q.id];
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                )}
                {q.type === 'choice' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                          if (validationErrors[q.id]) {
                            setValidationErrors((prev) => {
                              const next = { ...prev };
                              delete next[q.id];
                              return next;
                            });
                          }
                        }}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-colors min-h-[48px] ${
                          answers[q.id] === opt
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200'
                        }`}
                      >
                        {sanitizeString(opt)}
                      </button>
                    ))}
                  </div>
                )}
                {validationErrors[q.id] && (
                  <p className="text-red-500 text-sm mt-1 text-center">
                    {validationErrors[q.id]}
                  </p>
                )}
              </div>
            ))}

            <div>
              <p className="font-medium mb-2 text-base">{t('survey.additionalComments')}</p>
              <textarea
                className="w-full border rounded-xl p-4 h-24 text-base"
                placeholder={t('survey.commentsPlaceholder')}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <Button
              onClick={handleSubmit}
              loading={submitting}
              className="w-full min-h-[56px] text-lg font-bold"
              icon={<MessageSquare className="w-5 h-5" />}
            >
              {submitting ? t('survey.submitting') : t('survey.submitFeedback')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
