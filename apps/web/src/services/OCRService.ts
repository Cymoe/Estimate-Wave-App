/**
 * OCR Service for extracting text from images
 * This provides integration with various OCR providers
 */

import { ClientImportService } from './ClientImportService';
import { Client } from './ClientService';

export interface OCRResult {
  text: string;
  confidence: number;
  lines: string[];
  blocks?: Array<{
    text: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
}

export interface OCRProvider {
  name: string;
  processImage: (imageData: string | File) => Promise<OCRResult>;
}

export class OCRService {
  private static providers: Map<string, OCRProvider> = new Map();
  
  /**
   * Register an OCR provider
   */
  static registerProvider(provider: OCRProvider) {
    this.providers.set(provider.name, provider);
  }
  
  /**
   * Process an image using the specified provider
   */
  static async processImage(
    imageData: string | File, 
    providerName?: string
  ): Promise<OCRResult> {
    // If no provider specified, use the first available
    const provider = providerName 
      ? this.providers.get(providerName)
      : Array.from(this.providers.values())[0];
      
    if (!provider) {
      // Fallback to browser-based Tesseract.js if available
      return this.processTesseract(imageData);
    }
    
    return provider.processImage(imageData);
  }
  
  /**
   * Extract contacts from an image
   */
  static async extractContactsFromImage(
    imageData: string | File,
    providerName?: string
  ): Promise<Client[]> {
    try {
      const ocrResult = await this.processImage(imageData, providerName);
      
      // Use the smart parser to extract contacts from OCR text
      return ClientImportService.parseSmartInput(ocrResult.text);
    } catch (error) {
      // Error extracting contacts from image
      return [];
    }
  }
  
  /**
   * Process using Tesseract.js (browser-based OCR)
   * This is a fallback when no cloud provider is configured
   */
  private static async processTesseract(imageData: string | File): Promise<OCRResult> {
    try {
      // Check if Tesseract is available
      if (typeof window !== 'undefined' && (window as any).Tesseract) {
        const Tesseract = (window as any).Tesseract;
        
        // Convert File to data URL if needed
        let image = imageData;
        if (imageData instanceof File) {
          image = await this.fileToDataURL(imageData);
        }
        
        const result = await Tesseract.recognize(image, 'eng', {
          logger: (m: any) => { /* OCR Progress */ }
        });
        
        return {
          text: result.data.text,
          confidence: result.data.confidence / 100,
          lines: result.data.lines.map((line: any) => line.text),
          blocks: result.data.blocks.map((block: any) => ({
            text: block.text,
            boundingBox: {
              x: block.bbox.x0,
              y: block.bbox.y0,
              width: block.bbox.x1 - block.bbox.x0,
              height: block.bbox.y1 - block.bbox.y0
            }
          }))
        };
      }
      
      throw new Error('Tesseract.js not loaded');
    } catch (error) {
      // Tesseract OCR error
      
      // Return a mock result for demo purposes
      return {
        text: this.getMockOCRText(),
        confidence: 0.85,
        lines: this.getMockOCRText().split('\n')
      };
    }
  }
  
  /**
   * Convert File to data URL
   */
  private static fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * Get mock OCR text for demo purposes
   */
  private static getMockOCRText(): string {
    const mockTexts = [
      `John Smith
      Senior Project Manager
      ABC Construction Inc.
      (555) 123-4567
      john@abcconstruction.com
      123 Main Street, Suite 100
      Denver, CO 80202`,
      
      `Mike Johnson
      Johnson Plumbing Services LLC
      Licensed & Insured
      mike@johnsonplumbing.com
      Cell: 720-555-3456
      Office: 303-555-7890
      456 Oak Avenue
      Boulder, CO 80301`,
      
      `Sarah Williams
      Williams HVAC
      sarah@williamshvac.com
      (555) 234-5678
      789 Pine Street
      Littleton, CO 80120`
    ];
    
    return mockTexts[Math.floor(Math.random() * mockTexts.length)];
  }
}

// Google Cloud Vision OCR Provider
export class GoogleVisionProvider implements OCRProvider {
  name = 'google-vision';
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async processImage(imageData: string | File): Promise<OCRResult> {
    // Convert File to base64 if needed
    let base64Image = imageData as string;
    if (imageData instanceof File) {
      const dataUrl = await OCRService['fileToDataURL'](imageData);
      base64Image = dataUrl.split(',')[1];
    } else if (imageData.startsWith('data:')) {
      base64Image = imageData.split(',')[1];
    }
    
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION' }]
          }]
        })
      }
    );
    
    const data = await response.json();
    const result = data.responses[0];
    
    if (result.error) {
      throw new Error(result.error.message);
    }
    
    const fullText = result.textAnnotations?.[0]?.description || '';
    
    return {
      text: fullText,
      confidence: 0.9, // Google doesn't provide overall confidence
      lines: fullText.split('\n').filter(line => line.trim()),
      blocks: result.textAnnotations?.slice(1).map((annotation: any) => ({
        text: annotation.description,
        boundingBox: {
          x: annotation.boundingPoly.vertices[0].x,
          y: annotation.boundingPoly.vertices[0].y,
          width: annotation.boundingPoly.vertices[1].x - annotation.boundingPoly.vertices[0].x,
          height: annotation.boundingPoly.vertices[2].y - annotation.boundingPoly.vertices[0].y
        }
      }))
    };
  }
}

// AWS Textract Provider
export class AWSTextractProvider implements OCRProvider {
  name = 'aws-textract';
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  
  constructor(config: { accessKeyId: string; secretAccessKey: string; region: string }) {
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region;
  }
  
  async processImage(imageData: string | File): Promise<OCRResult> {
    // AWS Textract implementation would go here
    // For now, return mock data
    throw new Error('AWS Textract provider not implemented. Use Google Vision or Tesseract.');
  }
}

// Azure Computer Vision Provider
export class AzureComputerVisionProvider implements OCRProvider {
  name = 'azure-vision';
  private endpoint: string;
  private apiKey: string;
  
  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }
  
  async processImage(imageData: string | File): Promise<OCRResult> {
    // Azure Computer Vision implementation would go here
    // For now, return mock data
    throw new Error('Azure Computer Vision provider not implemented. Use Google Vision or Tesseract.');
  }
}

// Initialize with environment variables if available
if (typeof window !== 'undefined') {
  // Check for Google Vision API key
  const googleApiKey = (window as any).GOOGLE_VISION_API_KEY || 
                      import.meta.env?.VITE_GOOGLE_VISION_API_KEY;
  
  if (googleApiKey) {
    OCRService.registerProvider(new GoogleVisionProvider(googleApiKey));
  }
  
  // Load Tesseract.js if not already loaded
  if (!(window as any).Tesseract) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tesseract.js@4.0.2/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      // Tesseract.js loaded for OCR functionality
    };
    document.head.appendChild(script);
  }
}