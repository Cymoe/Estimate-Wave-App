import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  _id: string;
  organizationId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    organizationId: { type: String, required: true, ref: 'Organization' },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: String,
    details: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: 'activity_logs',
  }
);

// Indexes
activityLogSchema.index({ organizationId: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ resourceType: 1, resourceId: 1 });

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);

