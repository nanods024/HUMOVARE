import { Modal } from '@/components/ui/Modal';
import { SizeGuideTables } from './SizeGuideTables';

export function SizeGuide({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} position="center" size="lg" title="Size guide">
      <div className="space-y-6 p-5 md:p-6">
        <p className="text-sm text-ink-muted">
          All measurements are in inches, taken with the garment laid flat. Oversized pieces are cut
          deliberately roomy — if you want a closer fit, size down.
        </p>

        <SizeGuideTables />
      </div>
    </Modal>
  );
}

export default SizeGuide;
