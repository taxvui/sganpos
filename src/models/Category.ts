import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  tenantId: string;
  name: string;
  icon?: string;
  color?: string;
  order: number;
  isActive: boolean;
}

const CategorySchema: Schema = new Schema({
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  icon: { type: String, default: 'Coffee' },
  color: { type: String, default: '#059669' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure unique name within tenant
CategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);
