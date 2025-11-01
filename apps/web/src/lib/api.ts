/**
 * API Client for MongoDB Backend
 * Replaces Supabase client calls
 */

const API_BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api`;

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      errorData.error || 'API request failed',
      response.status,
      errorData
    );
  }

  return response.json();
}

// Organizations API
export const organizationsAPI = {
  async list() {
    return fetchAPI('/organizations');
  },
  
  async getById(id: string) {
    return fetchAPI(`/organizations/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/organizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/organizations/${id}`, {
      method: 'DELETE',
    });
  },
};

// Clients API
export const clientsAPI = {
  async list(organizationId: string) {
    return fetchAPI(`/clients?organizationId=${organizationId}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/clients/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/clients/${id}`, {
      method: 'DELETE',
    });
  },
};

// Estimates API
export const estimatesAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    let query = `organizationId=${organizationId}`;
    if (filters?.clientId) query += `&clientId=${filters.clientId}`;
    if (filters?.status) query += `&status=${filters.status}`;
    
    return fetchAPI(`/estimates?${query}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/estimates/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/estimates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/estimates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/estimates/${id}`, {
      method: 'DELETE',
    });
  },
  
  async sign(id: string, signature: string) {
    return fetchAPI(`/estimates/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ signature }),
    });
  },
};

// Invoices API
export const invoicesAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    let query = `organizationId=${organizationId}`;
    if (filters?.clientId) query += `&clientId=${filters.clientId}`;
    if (filters?.status) query += `&status=${filters.status}`;
    
    return fetchAPI(`/invoices?${query}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/invoices/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/invoices/${id}`, {
      method: 'DELETE',
    });
  },
  
  async markAsPaid(id: string, amountPaid: number) {
    return fetchAPI(`/invoices/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amountPaid }),
    });
  },
};

// Projects API
export const projectsAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    let query = `organizationId=${organizationId}`;
    if (filters?.clientId) query += `&clientId=${filters.clientId}`;
    if (filters?.status) query += `&status=${filters.status}`;
    
    return fetchAPI(`/projects?${query}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/projects/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/projects/${id}`, {
      method: 'DELETE',
    });
  },
};

// Activity Logs API
export const activityLogsAPI = {
  async list(organizationId: string, filters?: { userId?: string; resourceType?: string; limit?: number }) {
    let query = `organizationId=${organizationId}`;
    if (filters?.userId) query += `&userId=${filters.userId}`;
    if (filters?.resourceType) query += `&resourceType=${filters.resourceType}`;
    if (filters?.limit) query += `&limit=${filters.limit}`;
    
    return fetchAPI(`/activity-logs?${query}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/activity-logs/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/activity-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Line Items (Price Book) API 🎯
export const lineItemsAPI = {
  async list(organizationId: string, filters?: { 
    costCodeId?: string; 
    category?: string;
    search?: string;
    isActive?: boolean;
    includeShared?: boolean;
  }) {
    let query = `organizationId=${organizationId}`;
    if (filters?.costCodeId) query += `&costCodeId=${filters.costCodeId}`;
    if (filters?.category) query += `&category=${filters.category}`;
    if (filters?.search) query += `&search=${filters.search}`;
    if (filters?.isActive !== undefined) query += `&isActive=${filters.isActive}`;
    if (filters?.includeShared !== undefined) query += `&includeShared=${filters.includeShared}`;
    
    return fetchAPI(`/line-items?${query}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/line-items/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/line-items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/line-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/line-items/${id}`, {
      method: 'DELETE',
    });
  },
  
  async bulkCreate(items: any[]) {
    return fetchAPI('/line-items/bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

// Cost Codes API
export const costCodesAPI = {
  async list(filters?: { 
    industryId?: string; 
    category?: string; 
    isActive?: boolean;
  }) {
    let query = '';
    const params: string[] = [];
    
    if (filters?.industryId) params.push(`industryId=${filters.industryId}`);
    if (filters?.category) params.push(`category=${filters.category}`);
    if (filters?.isActive !== undefined) params.push(`isActive=${filters.isActive}`);
    
    if (params.length > 0) query = `?${params.join('&')}`;
    
    return fetchAPI(`/cost-codes${query}`);
  },
  
  async getById(id: string) {
    return fetchAPI(`/cost-codes/${id}`);
  },
  
  async create(data: any) {
    return fetchAPI('/cost-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: any) {
    return fetchAPI(`/cost-codes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string) {
    return fetchAPI(`/cost-codes/${id}`, {
      method: 'DELETE',
    });
  },
  
  async bulkCreate(items: any[]) {
    return fetchAPI('/cost-codes/bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

export { APIError };

