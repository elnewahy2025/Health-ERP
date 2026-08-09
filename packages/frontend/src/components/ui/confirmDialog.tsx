import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal } from './Modal';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  requireInput?: boolean;
}

// In-app replacement for window.confirm / window.prompt / window.alert.
// Resolves with `true` (confirm), a trimmed string (prompt with input), or
// `null` when dismissed — no native browser dialogs are shown.
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;

    const cleanup = () => {
      if (root) {
        root.unmount();
        root = null;
      }
      container.remove();
    };

    function Dialog() {
      const [value, setValue] = useState('');
      const hasInput = Boolean(options.inputLabel);
      const canConfirm = !hasInput || !options.requireInput || value.trim().length > 0;

      const close = (result: boolean | string | null) => {
        cleanup();
        resolve(result);
      };

      return (
        <Modal
          open
          onClose={() => close(null)}
          title={options.title}
          size="sm"
          footer={
            <>
              <button className="btn-secondary" onClick={() => close(null)}>
                {options.cancelLabel || 'Cancel'}
              </button>
              <button
                className={options.danger ? 'btn-danger' : 'btn-primary'}
                disabled={!canConfirm}
                onClick={() => close(hasInput ? value.trim() : true)}
              >
                {options.confirmLabel || 'Confirm'}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600">{options.message}</p>
          {hasInput && (
            <input
              className="input mt-3 w-full"
              value={value}
              autoFocus
              placeholder={options.inputPlaceholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) {
                  close(hasInput ? value.trim() : true);
                }
              }}
            />
          )}
        </Modal>
      );
    }

    root = createRoot(container);
    root.render(<Dialog />);
  });
}
