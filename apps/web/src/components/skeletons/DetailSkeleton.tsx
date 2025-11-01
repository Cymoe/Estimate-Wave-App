import React from 'react';

export const DetailSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      {/* Header - Matching Invoice Page Style */}
      <div className="border-b border-[#333333] px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Back, Title, Status, Client */}
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-[#333333] rounded-[4px] animate-pulse"></div>
            
            <div className="flex items-center gap-3">
              <div className="w-32 h-5 bg-[#333333] rounded animate-pulse"></div>
              <div className="w-16 h-6 bg-[#333333] rounded-[4px] animate-pulse"></div>
              <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
            </div>
          </div>

          {/* Right side - Action Buttons */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-9 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md animate-pulse"></div>
            <div className="w-16 h-9 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md animate-pulse"></div>
            <div className="w-16 h-9 bg-[#336699] rounded-md animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#181818] text-white rounded-[4px] shadow-lg p-8 min-h-[800px] border border-[#333333]">
            {/* Invoice Header */}
            <div className="flex justify-between items-start mb-8">
              <div className="space-y-2">
                <div className="w-32 h-6 bg-[#333333] rounded animate-pulse"></div>
                <div className="space-y-1">
                  <div className="w-40 h-3 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-36 h-3 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-32 h-3 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-44 h-3 bg-[#333333] rounded animate-pulse"></div>
                </div>
              </div>
              <div className="text-right space-y-2">
                <div className="w-28 h-6 bg-[#333333] rounded animate-pulse"></div>
                <div className="space-y-1">
                  <div className="w-32 h-3 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-28 h-3 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="w-16 h-5 bg-[#333333] rounded-full animate-pulse mt-2"></div>
              </div>
            </div>

            {/* Bill To Section */}
            <div className="mb-8">
              <div className="w-16 h-4 bg-[#333333] rounded animate-pulse mb-2"></div>
              <div className="space-y-1">
                <div className="w-36 h-4 bg-[#333333] rounded animate-pulse"></div>
                <div className="w-44 h-3 bg-[#333333] rounded animate-pulse"></div>
                <div className="w-40 h-3 bg-[#333333] rounded animate-pulse"></div>
                <div className="w-32 h-3 bg-[#333333] rounded animate-pulse"></div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8">
              <div className="border-b-2 border-[#333333] pb-3 mb-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="w-12 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-8 h-4 bg-[#333333] rounded animate-pulse justify-self-end"></div>
                  <div className="w-12 h-4 bg-[#333333] rounded animate-pulse justify-self-end"></div>
                  <div className="w-16 h-4 bg-[#333333] rounded animate-pulse justify-self-end"></div>
                </div>
              </div>
              
              {/* Item rows */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-4 gap-4 py-4 border-b border-[#333333]">
                  <div className="space-y-1">
                    <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
                    <div className="w-32 h-3 bg-[#333333] rounded animate-pulse"></div>
                  </div>
                  <div className="w-4 h-4 bg-[#333333] rounded animate-pulse justify-self-end"></div>
                  <div className="w-12 h-4 bg-[#333333] rounded animate-pulse justify-self-end"></div>
                  <div className="w-16 h-4 bg-[#333333] rounded animate-pulse justify-self-end"></div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <div className="w-16 h-3 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-20 h-3 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-12 h-3 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-16 h-3 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="border-t border-[#333333] pt-2">
                  <div className="flex justify-between">
                    <div className="w-12 h-5 bg-[#333333] rounded animate-pulse"></div>
                    <div className="w-20 h-5 bg-[#333333] rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};