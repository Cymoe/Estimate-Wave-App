import React, { useState, useRef } from 'react';
import { Upload, X, FileImage, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface DesignUploadProps {
  estimateId: string;
  projectId?: string;
  currentImageUrl?: string;
  currentImageName?: string;
  onUploadComplete: (imageUrl: string, imageName: string) => void;
  onRemove: () => void;
}

export const DesignUpload: React.FC<DesignUploadProps> = ({
  estimateId,
  projectId,
  currentImageUrl,
  currentImageName,
  onUploadComplete,
  onRemove
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    setUploading(true);

    try {
      // Generate unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${estimateId}_design_${Date.now()}.${fileExt}`;
      const filePath = `project-designs/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('project-files')
        .getPublicUrl(filePath);

      const imageUrl = urlData.publicUrl;

      // Store as project document if projectId exists
      if (projectId) {
        await supabase
          .from('project_documents')
          .insert({
            project_id: projectId,
            name: `Agreed Design - ${file.name}`,
            type: 'agreed_design',
            content: imageUrl,
            status: 'active',
            display_order: 0
          });
      }

      onUploadComplete(imageUrl, file.name);
    } catch (error) {
      console.error('Error uploading design:', error);
      alert('Failed to upload design. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleRemoveDesign = async () => {
    if (currentImageUrl) {
      try {
        // Extract file path from URL
        const url = new URL(currentImageUrl);
        const filePath = url.pathname.split('/').slice(-2).join('/'); // Get 'project-designs/filename'
        
        // Delete from storage
        await supabase.storage
          .from('project-files')
          .remove([filePath]);

        // Remove from project documents if exists
        if (projectId) {
          await supabase
            .from('project_documents')
            .delete()
            .eq('project_id', projectId)
            .eq('type', 'agreed_design');
        }

        onRemove();
      } catch (error) {
        console.error('Error removing design:', error);
        // Still call onRemove to update UI even if deletion fails
        onRemove();
      }
    }
  };

  if (currentImageUrl) {
    return (
      <div className="bg-[#2a2a2a] border border-[#333333] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Agreed Design</h3>
          <button
            onClick={handleRemoveDesign}
            className="text-red-400 hover:text-red-300 transition-colors"
            title="Remove design"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="space-y-3">
          <div className="relative">
            <img
              src={currentImageUrl}
              alt="Agreed Design"
              className="w-full max-h-64 object-contain rounded border border-[#444444]"
            />
          </div>
          
          <div className="flex items-center text-sm text-gray-300">
            <Check size={16} className="text-green-400 mr-2" />
            <span>{currentImageName || 'Design uploaded'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#2a2a2a] border border-[#333333] rounded-lg p-4">
      <h3 className="text-sm font-medium text-white mb-3">Upload Agreed Design</h3>
      
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
          dragOver
            ? 'border-blue-400 bg-blue-400/10'
            : 'border-[#444444] hover:border-[#555555]'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <div className="space-y-2">
            <div className="animate-spin mx-auto w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
            <p className="text-sm text-gray-300">Uploading design...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <FileImage size={32} className="mx-auto text-gray-400" />
            <div className="space-y-1">
              <p className="text-sm text-white">Drop your ArcSite design here or</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                browse files
              </button>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG, PDF up to 10MB</p>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-400">
        This design will be automatically included in the contract under "Agreed Design" section.
      </div>
    </div>
  );
};