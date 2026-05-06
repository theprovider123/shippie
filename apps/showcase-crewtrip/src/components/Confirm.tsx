import { Dialog } from './Dialog';

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface ConfirmProps {
  request: ConfirmRequest | null;
  onClose: () => void;
}

export function Confirm({ request, onClose }: ConfirmProps) {
  if (!request) {
    return <Dialog open={false} onClose={onClose} label="">{null}</Dialog>;
  }
  return (
    <Dialog open onClose={onClose} label={request.title} className="confirm-sheet">
      <div className="sheet-handle" />
      <div className="confirm-body">
        <h2>{request.title}</h2>
        <p>{request.body}</p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="ghost" onClick={onClose}>
          {request.cancelLabel ?? 'Cancel'}
        </button>
        <button
          type="button"
          className={request.destructive ? 'danger' : ''}
          onClick={() => {
            request.onConfirm();
            onClose();
          }}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
