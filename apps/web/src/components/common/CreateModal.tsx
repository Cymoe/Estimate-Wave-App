import React from 'react';
import { useNavigate } from 'react-router-dom';

interface CreateDropdownProps {
  onCreateLineItem: () => void;
  onCreateClient: () => void;
  onCreateProject: () => void;
  onCreateProduct: () => void;
  onCreatePackage?: () => void; // Optional as part of simplification
  onCreatePriceBookTemplate: () => void;
  onCreateProjectTemplate: () => void;
  onCreateContractTemplate: () => void;
  // onCreateCategory is not used in the component
}

export const CreateDropdown: React.FC<CreateDropdownProps> = ({
  onCreateLineItem,
  onCreateClient,
  onCreateProject,
  onCreateProduct,
  onCreatePackage,
  onCreatePriceBookTemplate,
  onCreateProjectTemplate,
  onCreateContractTemplate
}) => {
  const navigate = useNavigate();
  
  return (
    <div className="w-full bg-[#121212] p-2 flex flex-col overflow-y-auto">
      {/* Section: Main Items */}
      <div className="mb-2">
        <h3 className="text-gray-400 text-xs uppercase font-medium mb-1 px-3">CREATE</h3>
        <div className="grid grid-cols-1 gap-1">
          <button 
            onClick={() => navigate('/work')} 
            className="flex items-center gap-2 px-3 py-2 text-gray-300 text-xs font-medium text-left hover:bg-[#1E1E1E] hover:border-l-2 hover:border-[#336699] rounded-md transition-colors w-full"
          >
            <span className="text-lg text-[#336699]">📋</span>
            Full Estimate
          </button>
          <button 
            onClick={onCreateClient} 
            className="flex items-center gap-2 px-3 py-2 text-gray-300 text-xs font-medium text-left hover:bg-[#1E1E1E] hover:border-l-2 hover:border-[#336699] rounded-md transition-colors w-full"
          >
            <span className="text-lg text-[#336699]">👤</span>
            Client
          </button>
        </div>
      </div>

      {/* Section: Advanced (Hidden by default) */}
      <div className="border-t border-gray-700 pt-2">
        <h3 className="text-gray-400 text-xs uppercase font-medium mb-1 px-3">ADVANCED</h3>
        <div className="grid grid-cols-1 gap-1">
          <button 
            onClick={onCreateLineItem} 
            className="flex items-center gap-2 px-3 py-2 text-gray-500 text-xs font-medium text-left hover:bg-[#1E1E1E] hover:border-l-2 hover:border-[#336699] rounded-md transition-colors w-full"
          >
            <span className="text-lg text-gray-500">+</span>
            Line Item
          </button>
          <button 
            onClick={onCreateProduct} 
            className="flex items-center gap-2 px-3 py-2 text-gray-500 text-xs font-medium text-left hover:bg-[#1E1E1E] hover:border-l-2 hover:border-[#336699] rounded-md transition-colors w-full"
          >
            <span className="text-lg text-gray-500">📦</span>
            Product
          </button>
        </div>
      </div>
    </div>
  );
};
