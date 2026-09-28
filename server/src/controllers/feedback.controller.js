import * as feedbackService from '../services/feedback.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated } from '../utils/response.js';

export const submitFeedback = asyncHandler(async (req, res) => {
  await feedbackService.submitFeedback(req.body, req.user);

  // The stored message is never echoed back: nothing the sender typed needs to
  // come back over the wire, and not returning it keeps the endpoint useless
  // as a way to read other people's messages.
  return sendCreated(res, { message: 'Message received \u2014 we will reply within a day', data: {} });
});

export default { submitFeedback };
