import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceItem {
  _id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  costCode?: string;
  displayOrder: number;
}

export interface IInvoice extends Document {
  _id: string;
  userId: string;
  organizationId: string;
  clientId: string;
  projectId?: string;
  estimateId?: string;
  invoiceNumber: string;
  title?: string;
  description?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  notes?: string;
  terms?: string;
  items: IInvoiceItem[];
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<IInvoiceItem>({
  productId: String,
  description: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  unitPrice: { type: Number, required: true, default: 0 },
  totalPrice: { type: Number, required: true, default: 0 },
  costCode: String,
  displayOrder: { type: Number, default: 0 },
});

const invoiceSchema = new Schema<IInvoice>(
  {
    userId: { type: String, required: true },
    organizationId: { type: String, required: true, ref: 'Organization' },
    clientId: { type: String, required: true, ref: 'Client' },
    projectId: { type: String, ref: 'Project' },
    estimateId: { type: String, ref: 'Estimate' },
    invoiceNumber: { type: String, required: true },
    title: String,
    description: String,
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
    },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    paidDate: Date,
    subtotal: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    notes: String,
    terms: String,
    items: [invoiceItemSchema],
  },
  {
    timestamps: true,
    collection: 'invoices',
  }
);

// Indexes
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ projectId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });

// Pre-save middleware to calculate totals
invoiceSchema.pre('save', function (next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      item.totalPrice = item.quantity * item.unitPrice;
    });

    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
    this.taxAmount = (this.subtotal * this.taxRate) / 100;
    this.totalAmount = this.subtotal + this.taxAmount;
  }
  next();
});

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);

