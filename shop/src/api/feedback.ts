import { api } from './client';

export interface FeedbackPayload {
  name: string;
  email: string;
  topic?: 'general' | 'order' | 'product' | 'returns' | 'wholesale';
  subject?: string;
  message: string;
}

/** The contact form. Messages land in the admin's feedback inbox. */
export const feedbackApi = {
  submit: (payload: FeedbackPayload) => api.post<Record<string, never>>('/feedback', payload),
};

export default feedbackApi;
