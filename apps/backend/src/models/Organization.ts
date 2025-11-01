import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  _id: string;
  name: string;
  slug: string;
  industryId?: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country: string;
  settings: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    industryId: { type: String, ref: 'Industry' },
    description: String,
    logoUrl: String,
    website: String,
    phone: String,
    email: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    country: { type: String, default: 'US' },
    settings: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'organizations',
  }
);

// Indexes
organizationSchema.index({ slug: 1 });
organizationSchema.index({ industryId: 1 });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);

