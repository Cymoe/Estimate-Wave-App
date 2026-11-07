import { supabase } from './supabase';
import { ClientService } from '../services/ClientService';
import { ProjectService, type Project } from '../services/ProjectService';

export type Tables = {
  projects: {
    id: string;
    name: string;
    description: string;
    client_id: string;
    status: 'planned' | 'active' | 'completed' | 'on-hold' | 'cancelled';
    budget: number;
    start_date: string;
    end_date: string;
    category?: string;
    created_at: string;
    updated_at: string;
  };
  bills: {
    id: string;
    user_id: string;
    amount: number;
    description: string;
    due_date: string;
    status: 'pending' | 'paid' | 'overdue';
    created_at: string;
  };
  users: {
    id: string;
    name: string;
    email: string;
    picture?: string;
    company?: string;
    title?: string;
    phone?: string;
    address?: string;
    bio?: string;
    settings: {
      theme: string;
      emailNotifications: boolean;
      currency: string;
      dateFormat: string;
      timeZone: string;
    };
    created_at: string;
    last_login_at?: string;
    last_updated_at: string;
  };
  clients: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    phone?: string;
    address?: string;
    company_name: string;
    notes?: string;
    created_at: string;
  };
  invoices: {
    id: string;
    user_id: string;
    client_id: string;
    invoice_number: string;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    due_date: string;
    total_amount: number;
    created_at: string;
  };
  products: {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    price: number;
    created_at: string;
  };
  invoice_items: {
    id: string;
    invoice_id: string;
    product_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  };
  invoice_templates: {
    id: string;
    user_id: string;
    name: string;
    content: any; // JSONB type
    created_at: string;
  };
};

export const db = {
  // Projects and clients live in Convex; these delegate to their services.
  projects: {
    async list(organizationId: string, clientId?: string) {
      return ProjectService.list(organizationId, clientId ? { clientId } : undefined);
    },

    async getById(id: string) {
      const project = await ProjectService.getById(id);
      if (!project) throw new Error('Project not found');
      return project;
    },

    async create(data: Omit<Tables['projects'], 'id' | 'created_at' | 'updated_at'> & { organization_id: string }) {
      return ProjectService.create(data as Parameters<typeof ProjectService.create>[0]);
    },

    async update(id: string, data: Partial<Tables['projects']>) {
      return ProjectService.update(id, data as Partial<Project>);
    },

    async delete(id: string) {
      await ProjectService.delete(id);
    },

    async getProjectBills(projectId: string): Promise<Tables['bills'][]> {
      const { data, error } = await supabase
        .from('project_bills')
        .select('bills (*)')
        .eq('project_id', projectId);

      if (error) {
        throw error;
      }

      // Handle the nested data structure from Supabase
      if (!data) return [];
      
      return data.reduce<Tables['bills'][]>((acc, item) => {
        const bill = item.bills;
        if (
          bill &&
          typeof bill === 'object' &&
          'id' in bill &&
          'user_id' in bill &&
          'amount' in bill &&
          'description' in bill &&
          'due_date' in bill &&
          'status' in bill &&
          'created_at' in bill
        ) {
          acc.push(bill as Tables['bills']);
        }
        return acc;
      }, []);
    },

    async addBillToProject(projectId: string, billId: string) {
      const { error } = await supabase
        .from('project_bills')
        .insert([{ project_id: projectId, bill_id: billId }]);

      if (error) {
        throw error;
      }
    },

    async removeBillFromProject(projectId: string, billId: string) {
      const { error } = await supabase
        .from('project_bills')
        .delete()
        .eq('project_id', projectId)
        .eq('bill_id', billId);

      if (error) {
        throw error;
      }
    }
  },
  users: {
    async getById(id: string) {
      const { data, error } = await supabase
        .from('users')
        .select()
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    async update(id: string, data: Partial<Tables['users']>) {
      const { error } = await supabase
        .from('users')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    }
  },
  clients: {
    async list(organizationId: string) {
      return ClientService.list(organizationId);
    },
    async create(data: Omit<Tables['clients'], 'id' | 'created_at'> & { user_id: string; organization_id: string }) {
      return ClientService.create(data);
    },
    async update(id: string, data: Partial<Tables['clients']>) {
      await ClientService.update(id, data);
    },
    async delete(id: string) {
      await ClientService.delete(id);
    }
  },
  invoices: {
    async list(organizationId: string) {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          clients (
            name,
            email,
            company
          )
        `)
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data;
    },
    async getById(id: string) {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          clients (
            name,
            email,
            company,
            address,
            phone
          )
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    async create(data: Omit<Tables['invoices'], 'id' | 'created_at'> & { organization_id: string }) {
      const { error } = await supabase
        .from('invoices')
        .insert(data);
      if (error) throw error;
    },
    async update(id: string, data: Partial<Tables['invoices']>) {
      const { error } = await supabase
        .from('invoices')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    async delete(id: string) {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
  },
  products: {
    async list(organizationId: string, costCodeId?: string) {
      const query = supabase
        .from('products')
        .select(`
          *,
          cost_code:cost_codes(name, code),
          vendor:vendors(name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (costCodeId) {
        query.eq('cost_code_id', costCodeId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    },
    async getById(id: string) {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          cost_code:cost_codes(name, code),
          vendor:vendors(name)
        `)
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    async create(data: Omit<Tables['products'], 'id' | 'created_at' | 'updated_at'> & { organization_id: string }) {
      const { data: product, error } = await supabase
        .from('products')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return product;
    },
    async update(id: string, data: Partial<Tables['products']>) {
      const { data: product, error } = await supabase
        .from('products')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return product;
    },
    async delete(id: string) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }
    }
  },
  invoice_items: {
    async list(invoiceId: string) {
      const { data, error } = await supabase
        .from('invoice_items')
        .select(`
          *,
          products (*)
        `)
        .eq('invoice_id', invoiceId);
      if (error) throw error;
      return data;
    },
    async create(data: Omit<Tables['invoice_items'], 'id'>) {
      const { error } = await supabase
        .from('invoice_items')
        .insert(data);
      if (error) throw error;
    },
    async update(id: string, data: Partial<Tables['invoice_items']>) {
      const { error } = await supabase
        .from('invoice_items')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    async delete(id: string) {
      const { error } = await supabase
        .from('invoice_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
  },
  invoice_templates: {
    async list(organizationId: string) {
      // Get templates with their content
      const { data: templates, error: templatesError } = await supabase
        .from('invoice_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (templatesError) throw templatesError;

      // Fetch items for each template from the items table
      const templatesWithItems = await Promise.all(
        templates.map(async (template) => {
          const { data: tableItems, error: itemsError } = await supabase
            .from('invoice_template_items')
            .select('*, product:products(*)')
            .eq('template_id', template.id);

          if (itemsError) throw itemsError;

          // Convert table items to the expected format
          const items = (tableItems || []).map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            product: item.product
          }));

          return {
            ...template,
            description: template.content?.description || '',
            total_amount: template.content?.total_amount || 0,
            items: items
          };
        })
      );
      
      return templatesWithItems;
    },

    async getById(id: string) {
      const { data: template, error: templateError } = await supabase
        .from('invoice_templates')
        .select('*')
        .eq('id', id)
        .single();
      
      if (templateError) throw templateError;

      // Fetch items for the template
      const { data: items, error: itemsError } = await supabase
        .from('invoice_template_items')
        .select('*')
        .eq('template_id', id);
      
      if (itemsError) throw itemsError;
      
      return {
        ...template,
        description: template.content?.description || '',
        total_amount: template.content?.total_amount || 0,
        items: items || []
      };
    },

    async create(data: Omit<Tables['invoice_templates'], 'id' | 'created_at'> & { items: Array<{ product_id: string; quantity: number; price: number }> }) {
      const { items, ...templateData } = data;
      
      // Start a transaction
      const { data: template, error: templateError } = await supabase
        .from('invoice_templates')
        .insert(templateData)
        .select()
        .single();
      
      if (templateError) throw templateError;

      // Insert items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_template_items')
          .insert(
            items.map(item => ({
              template_id: template.id,
              ...item
            }))
          );
        
        if (itemsError) throw itemsError;
      }

      return template;
    },

    async update(id: string, data: Partial<Tables['invoice_templates']> & { items?: Array<{ product_id: string; quantity: number; price: number }> }) {
      const { items, ...templateData } = data;
      
      // Update template
      const { error: templateError } = await supabase
        .from('invoice_templates')
        .update({
          ...templateData,
          content: {
            ...(templateData.content || {}),
            description: templateData.content?.description || '',
            updated_at: new Date().toISOString()
          }
        })
        .eq('id', id);
      
      if (templateError) throw templateError;

      // Update items if provided
      if (items) {
        // Delete existing items
        const { error: deleteError } = await supabase
          .from('invoice_template_items')
          .delete()
          .eq('template_id', id);
        
        if (deleteError) throw deleteError;

        // Insert new items
        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from('invoice_template_items')
            .insert(
              items.map(item => ({
                template_id: id,
                ...item
              }))
            );
          
          if (itemsError) throw itemsError;
        }
      }
    },

    async delete(id: string) {
      // Delete template (items will be cascade deleted)
      const { error } = await supabase
        .from('invoice_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    }
  },
  costCodes: {
    async list() {
      const { data, error } = await supabase
        .from('cost_codes')
        .select('*')
        .order('code');

      if (error) {
        throw error;
      }

      return data;
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('cost_codes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return data;
    }
  },
  lineItems: {
    async list(costCodeId?: string) {
      const query = supabase
        .from('line_items')
        .select(`
          *,
          cost_code:cost_codes(name, code),
          vendor:vendors(name)
        `)
        .order('created_at', { ascending: false });

      if (costCodeId) {
        query.eq('cost_code_id', costCodeId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('line_items')
        .select(`
          *,
          cost_code:cost_codes(name, code),
          vendor:vendors(name)
        `)
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async create(data: any) {
      const { data: lineItem, error } = await supabase
        .from('line_items')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return lineItem;
    },

    async update(id: string, data: any) {
      const { data: lineItem, error } = await supabase
        .from('line_items')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return lineItem;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('line_items')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }
    }
  }
};
