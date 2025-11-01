import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/format';
import { Package, Clock, Calculator, ArrowLeft, AlertCircle } from 'lucide-react';

interface SharedItem {
  id: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
  calculationType: string;
}

interface SharedConfig {
  serviceOptionId: string;
  serviceOptionName: string;
  items: SharedItem[];
  totalPrice: number;
  timestamp: string;
}

export const SharedServiceOption: React.FC = () => {
  const { encodedConfig } = useParams<{ encodedConfig: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<SharedConfig | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (encodedConfig) {
      try {
        // Convert URL-safe base64 back to regular base64
        let base64 = encodedConfig
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if necessary
        const padding = base64.length % 4;
        if (padding) {
          base64 += '='.repeat(4 - padding);
        }
        
        // Decode the configuration
        const decoded = atob(base64);
        const parsedConfig: SharedConfig = JSON.parse(decoded);
        setConfig(parsedConfig);
      } catch (err) {
        setError('Invalid or expired share link');
      }
    }
  }, [encodedConfig]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1A1A1A] rounded-lg p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Share Link</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-[#336699] hover:bg-[#4477AA] text-white rounded-md transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const sharedDate = new Date(config.timestamp);

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="bg-[#1A1A1A] border-b border-[#333333] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-white">Service Option Configuration</h1>
                <p className="text-sm text-gray-400">
                  Shared on {sharedDate.toLocaleDateString()} at {sharedDate.toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Service Option Header */}
        <div className="bg-[#1A1A1A] rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-8 h-8 text-[#336699]" />
            <h2 className="text-2xl font-semibold text-white">{config.serviceOptionName}</h2>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400">Total Price:</span>
              <span className="text-2xl font-mono font-semibold text-white">
                {formatCurrency(config.totalPrice)}
              </span>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="bg-[#1A1A1A] rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Included Items</h3>
          
          <div className="space-y-3">
            {config.items.map((item, index) => (
              <div 
                key={index} 
                className="bg-[#252525] rounded-md p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-white font-medium">{item.name}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {formatCurrency(item.price)}/{item.unit}
                  </p>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Quantity</p>
                    <p className="text-lg font-mono text-white">{item.quantity}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Subtotal</p>
                    <p className="text-lg font-mono text-[#EAB308]">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Summary */}
          <div className="mt-6 pt-6 border-t border-[#333333]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400">Total Items</p>
                <p className="text-2xl font-semibold text-white">{config.items.length}</p>
              </div>
              
              <div className="text-right">
                <p className="text-gray-400">Total Price</p>
                <p className="text-3xl font-mono font-semibold text-[#EAB308]">
                  {formatCurrency(config.totalPrice)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-8 bg-[#1A1A1A] rounded-lg p-6 text-center">
          <h3 className="text-lg font-medium text-white mb-2">Interested in this service?</h3>
          <p className="text-gray-400 mb-6">
            Contact us to get started with this customized service option.
          </p>
          <button
            onClick={() => window.location.href = 'mailto:contact@billbreeze.com?subject=Service Option Inquiry'}
            className="px-6 py-3 bg-[#EAB308] hover:bg-[#D97706] text-black font-medium rounded-md transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};