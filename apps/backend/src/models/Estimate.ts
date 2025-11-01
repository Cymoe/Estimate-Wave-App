import mongoose, { Schema, Document } from 'mongoose';

export interface IEstimateItem {
  _id: string;
  workPackItemId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  costCode?: string;
  displayOrder: number;
}

export interface IEstimate extends Document {
  _id: string;
  userId: string;
  organizationId: string;
  clientId: string;
  projectId?: string;
  estimateNumber: string;
  title?: string;
  description?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  issueDate: Date;
  expiryDate?: Date;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  terms?: string;
  clientSignature?: string;
  signedAt?: Date;
  items: IEstimateItem[];
  createdAt: Date;
  updatedAt: Date;
}

const estimateItemSchema = new Schema<IEstimateItem>({
  workPackItemId: String,
  description: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  unitPrice: { type: Number, required: true, default: 0 },
  totalPrice: { type: Number, required: true, default: 0 },
  costCode: String,
  displayOrder: { type: Number, default: 0 },
});

const estimateSchema = new Schema<IEstimate>(
  {
    userId: { type: String, required: true },
    organizationId: { type: String, required: true, ref: 'Organization' },
    clientId: { type: String, required: true, ref: 'Client' },
    projectId: { type: String, ref: 'Project' },
    estimateNumber: { type: String, required: true },
    title: String,
    description: String,
    status: {
      type: String,
      enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
      default: 'draft',
    },
    issueDate: { type: Date, default: Date.now },
    expiryDate: Date,
    subtotal: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    notes: String,
    terms: String,
    clientSignature: String,
    signedAt: Date,
    items: [estimateItemSchema],
  },
  {
    timestamps: true,
    collection: 'estimates',
  }
);

// Indexes
estimateSchema.index({ organizationId: 1, estimateNumber: 1 }, { unique: true });
estimateSchema.index({ clientId: 1 });
estimateSchema.index({ projectId: 1 });
estimateSchema.index({ status: 1 });
estimateSchema.index({ issueDate: -1 });

// Pre-save middleware to calculate totals
estimateSchema.pre('save', function (next) {
  if (this.items && this.items.length > 0) {
    // Calculate item totals
    this.items.forEach((item) => {
      item.totalPrice = item.quantity * item.unitPrice;
    });

    // Calculate estimate totals
    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
    this.taxAmount = (this.subtotal * this.taxRate) / 100;
    this.totalAmount = this.subtotal + this.taxAmount;
  }
  next();
});

export const Estimate = mongoose.model<IEstimate>('Estimate', estimateSchema);

