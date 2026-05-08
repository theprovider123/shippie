/**
 * Review page — the user confirms / corrects extracted fields, then
 * saves. Saving emits the cross-app intent (`expense-logged`, plus
 * `dined-out` when category implies a restaurant).
 */
import { ReviewForm, type ReviewFormValues } from '../components/ReviewForm.tsx';
import type { ExtractedReceipt } from '../lib/parse-receipt.ts';

interface ReviewPageProps {
  extracted: ExtractedReceipt;
  rawOcrText: string;
  imageDataUrl: string;
  onSave: (values: ReviewFormValues) => void;
  onCancel: () => void;
}

export function ReviewPage({
  extracted,
  rawOcrText,
  imageDataUrl,
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
        onSave={onSave}
        onCancel={onCancel}
      />
    </section>
  );
}
