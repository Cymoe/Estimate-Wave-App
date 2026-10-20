import React, { useContext, useEffect } from 'react';
import { Modal } from './Modal';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { TradesEditor } from '../settings/TradesEditor';

interface IndustryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** "Your trades" as a pop-up (from the Price Book line): the same editor as Company settings → Trades. */
export const IndustryManagementModal: React.FC<IndustryManagementModalProps> = ({ isOpen, onClose }) => {
  const { selectedOrg } = useContext(OrganizationContext);
  // The floating + button steps aside while this is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('industryModalToggle', { detail: { isOpen } }));
  }, [isOpen]);
  if (!isOpen || !selectedOrg?.id) return null;
  return (
    <Modal
      isOpen
      title="Your trades"
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded text-sm font-medium text-white bg-[#336699] hover:bg-[#2a5580]">
            Done
          </button>
        </div>
      }
    >
      <TradesEditor organizationId={selectedOrg.id} className="p-6" />
    </Modal>
  );
};
