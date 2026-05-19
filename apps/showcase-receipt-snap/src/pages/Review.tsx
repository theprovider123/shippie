/**
 * Review page — the user confirms / corrects extracted fields, then
 * saves. Saving emits the cross-app intent (`expense-logged`, plus
 * `dined-out` when category implies a restaurant).
 */
import { ReviewForm, type ReviewFormValues, type ReviewMode } from '../components/ReviewForm.tsx';
import type { ExtractedReceipt } from '../lib/parse-receipt.ts';

interface ReviewPageProps {
  extracted: ExtractedReceipt;
  rawOcrText: string;
  imageDataUrl: string;
  /** Review mode (defaults to 'quick' on first install; user changes in Settings). */
  mode?: ReviewMode;
  onSave: (values: ReviewFormValues) => void;
  onCancel: () => void;
}

export function ReviewPage({
  extracted,
  rawOcrText,
  imageDataUrl,
  mode = 'quick',
  onSave,
  onCancel,
}: ReviewPageProps) {
  return (
    <section className="page review-page">
      <div className="review-thumb">
        <img src={imageDataUrl} alt="captured receipt" />
      </div>
      <ReviewForm
        extracted={extracted}
        rawOcrText={rawOcrText}
        mode={mode}
        onSave={onSave}
        onCancel={onCancel}
      />
    </section>
  );
}
