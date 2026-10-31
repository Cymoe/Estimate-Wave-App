import { contractDocsAPI, type ContractDocKind } from '../lib/api';
import { uploadFile } from './uploads';

export const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

/** Why a file can't be a contract, or null when it can. */
export function contractFileProblem(file: File): string | null {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!pdf) return 'Contracts must be a PDF.';
  if (file.size > MAX_CONTRACT_BYTES) return 'That PDF is over 10MB.';
  return null;
}

/** Uploads a contract PDF to the company's library, or to one estimate when estimateId is given. */
export async function uploadContractDoc(organizationId: string, kind: ContractDocKind, file: File, estimateId?: string): Promise<string> {
  const problem = contractFileProblem(file);
  if (problem) throw new Error(problem);
  const storageId = await uploadFile(await contractDocsAPI.uploadUrl(organizationId), file);
  return await contractDocsAPI.add({ organizationId, kind, storageId, fileName: file.name, estimateId });
}
