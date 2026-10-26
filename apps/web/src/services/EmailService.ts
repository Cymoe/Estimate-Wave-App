import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/format';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailOptions {
  to: string | string[];
  cc?: string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding?: string;
  }>;
}

export class EmailService {
  private static async sendEmail(
    template: EmailTemplate,
    options: EmailOptions,
    metadata?: {
      entityType: 'invoice' | 'estimate';
      entityId: string;
      userId: string;
      organizationId: string;
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await supabase.functions.invoke('send-email', {
        body: {
          to: options.to,
          cc: options.cc,
          subject: template.subject,
          html: template.html,
          text: template.text,
          replyTo: options.replyTo,
          attachments: options.attachments,
          metadata,
        },
      });

      if (response.error) {
        throw response.error;
      }

      return response.data;
    } catch (error) {
      console.error('Email send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  static async sendInvoice(
    invoice: any,
    client: any,
    recipientEmail: string,
    options?: {
      message?: string;
      ccEmails?: string[];
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const invoiceUrl = `${window.location.origin}/share/invoice/${invoice.id}`;
    const template = this.getInvoiceEmailTemplate(invoice, client, invoiceUrl);
    
    return this.sendEmail(
      template,
      {
        to: recipientEmail,
        cc: options?.ccEmails,
        replyTo: 'onboarding@resend.dev',
      },
      {
        entityType: 'invoice',
        entityId: invoice.id,
        userId: invoice.user_id,
        organizationId: invoice.organization_id,
      }
    );
  }

  static async sendEstimate(
    estimate: any,
    client: any,
    recipientEmail: string,
    options?: {
      message?: string;
      ccEmails?: string[];
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const estimateUrl = `${window.location.origin}/share/estimate/${estimate.id}`;
    const template = this.getEstimateEmailTemplate(estimate, client, estimateUrl);
    
    return this.sendEmail(
      template,
      {
        to: recipientEmail,
        cc: options?.ccEmails,
        replyTo: 'onboarding@resend.dev',
      },
      {
        entityType: 'estimate',
        entityId: estimate.id,
        userId: estimate.user_id,
        organizationId: estimate.organization_id,
      }
    );
  }

  static async sendPaymentReminder(
    invoice: any,
    client: any,
    recipientEmail: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const invoiceUrl = `${window.location.origin}/share/invoice/${invoice.id}`;
    const daysPastDue = Math.floor((new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24));
    const template = this.getPaymentReminderEmailTemplate(invoice, client, invoiceUrl, daysPastDue);
    
    return this.sendEmail(
      template,
      {
        to: recipientEmail,
        replyTo: 'onboarding@resend.dev',
      },
      {
        entityType: 'invoice',
        entityId: invoice.id,
        userId: invoice.user_id,
        organizationId: invoice.organization_id,
      }
    );
  }

  private static getInvoiceEmailTemplate(invoice: any, client: any, invoiceUrl: string): EmailTemplate {
    const dueDate = new Date(invoice.due_date).toLocaleDateString();
    const amount = formatCurrency(invoice.amount);
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invoice ${invoice.invoice_number}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h1 style="color: #336699; margin-bottom: 20px;">Invoice ${invoice.invoice_number}</h1>
            
            <p>Dear ${client.name || client.company_name},</p>
            
            <p>Please find attached invoice ${invoice.invoice_number} for ${amount}.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
              <p style="margin: 5px 0;"><strong>Amount Due:</strong> ${amount}</p>
              <p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
              ${invoice.payment_terms ? `<p style="margin: 5px 0;"><strong>Payment Terms:</strong> ${invoice.payment_terms}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${invoiceUrl}" style="background-color: #336699; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Invoice</a>
            </div>
            
            ${invoice.notes ? `<p style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-top: 20px;"><strong>Notes:</strong><br>${invoice.notes}</p>` : ''}
            
            <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
            
            <p>Thank you for your business!</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              <p>This is an automated email. Please do not reply directly to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Invoice ${invoice.invoice_number}

Dear ${client.name || client.company_name},

Please find attached invoice ${invoice.invoice_number} for ${amount}.

Invoice Details:
- Invoice Number: ${invoice.invoice_number}
- Amount Due: ${amount}
- Due Date: ${dueDate}
${invoice.payment_terms ? `- Payment Terms: ${invoice.payment_terms}` : ''}

View Invoice: ${invoiceUrl}

${invoice.notes ? `Notes:\n${invoice.notes}\n` : ''}

If you have any questions about this invoice, please don't hesitate to contact us.

Thank you for your business!
    `.trim();

    return {
      subject: `Invoice ${invoice.invoice_number} - ${amount}`,
      html,
      text,
    };
  }

  private static getEstimateEmailTemplate(estimate: any, client: any, estimateUrl: string): EmailTemplate {
    const expiryDate = estimate.expiry_date ? new Date(estimate.expiry_date).toLocaleDateString() : null;
    const amount = formatCurrency(estimate.total_amount);
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Estimate ${estimate.estimate_number}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h1 style="color: #388E3C; margin-bottom: 20px;">Estimate ${estimate.estimate_number}</h1>
            
            <p>Dear ${client.name || client.company_name},</p>
            
            <p>Thank you for your interest in our services. Please find attached our estimate for your project.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Estimate Number:</strong> ${estimate.estimate_number}</p>
              <p style="margin: 5px 0;"><strong>Total Amount:</strong> ${amount}</p>
              ${estimate.title ? `<p style="margin: 5px 0;"><strong>Project:</strong> ${estimate.title}</p>` : ''}
              ${expiryDate ? `<p style="margin: 5px 0;"><strong>Valid Until:</strong> ${expiryDate}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${estimateUrl}" style="background-color: #388E3C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review & Accept Estimate</a>
            </div>
            
            ${estimate.description ? `<p style="background-color: #f0f0f0; padding: 15px; border-radius: 5px;"><strong>Description:</strong><br>${estimate.description}</p>` : ''}
            
            ${estimate.notes ? `<p style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-top: 10px;"><strong>Notes:</strong><br>${estimate.notes}</p>` : ''}
            
            <p>To accept this estimate, simply click the button above and follow the instructions.</p>
            
            <p>If you have any questions or would like to discuss this estimate, please don't hesitate to contact us.</p>
            
            <p>We look forward to working with you!</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              <p>This is an automated email. Please do not reply directly to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Estimate ${estimate.estimate_number}

Dear ${client.name || client.company_name},

Thank you for your interest in our services. Please find attached our estimate for your project.

Estimate Details:
- Estimate Number: ${estimate.estimate_number}
- Total Amount: ${amount}
${estimate.title ? `- Project: ${estimate.title}` : ''}
${expiryDate ? `- Valid Until: ${expiryDate}` : ''}

Review & Accept Estimate: ${estimateUrl}

${estimate.description ? `Description:\n${estimate.description}\n` : ''}
${estimate.notes ? `Notes:\n${estimate.notes}\n` : ''}

To accept this estimate, simply click the link above and follow the instructions.

If you have any questions or would like to discuss this estimate, please don't hesitate to contact us.

We look forward to working with you!
    `.trim();

    return {
      subject: `Estimate ${estimate.estimate_number} - ${estimate.title || amount}`,
      html,
      text,
    };
  }

  private static getPaymentReminderEmailTemplate(invoice: any, client: any, invoiceUrl: string, daysPastDue: number): EmailTemplate {
    const amount = formatCurrency(invoice.amount);
    const balanceDue = formatCurrency(invoice.balance_due || invoice.amount);
    const isOverdue = daysPastDue > 0;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Reminder - Invoice ${invoice.invoice_number}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h1 style="color: ${isOverdue ? '#D32F2F' : '#336699'}; margin-bottom: 20px;">
              ${isOverdue ? 'Overdue Invoice' : 'Payment Reminder'}
            </h1>
            
            <p>Dear ${client.name || client.company_name},</p>
            
            <p>
              ${isOverdue 
                ? `This is a friendly reminder that invoice ${invoice.invoice_number} is now ${daysPastDue} days overdue.`
                : `This is a friendly reminder that invoice ${invoice.invoice_number} is due for payment.`
              }
            </p>
            
            <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
              <p style="margin: 5px 0;"><strong>Original Amount:</strong> ${amount}</p>
              <p style="margin: 5px 0;"><strong>Balance Due:</strong> ${balanceDue}</p>
              <p style="margin: 5px 0; color: ${isOverdue ? '#D32F2F' : 'inherit'};"><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
              ${isOverdue ? `<p style="margin: 5px 0; color: #D32F2F;"><strong>Days Overdue:</strong> ${daysPastDue}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${invoiceUrl}" style="background-color: ${isOverdue ? '#D32F2F' : '#336699'}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Pay Invoice Now</a>
            </div>
            
            <p>Please remit payment at your earliest convenience to avoid any late fees or service interruptions.</p>
            
            <p>If you have already sent payment, please disregard this notice. If you have any questions or concerns about this invoice, please contact us immediately.</p>
            
            <p>Thank you for your prompt attention to this matter.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              <p>This is an automated reminder. Please do not reply directly to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
${isOverdue ? 'Overdue Invoice' : 'Payment Reminder'}

Dear ${client.name || client.company_name},

${isOverdue 
  ? `This is a friendly reminder that invoice ${invoice.invoice_number} is now ${daysPastDue} days overdue.`
  : `This is a friendly reminder that invoice ${invoice.invoice_number} is due for payment.`
}

Invoice Details:
- Invoice Number: ${invoice.invoice_number}
- Original Amount: ${amount}
- Balance Due: ${balanceDue}
- Due Date: ${new Date(invoice.due_date).toLocaleDateString()}
${isOverdue ? `- Days Overdue: ${daysPastDue}` : ''}

Pay Invoice Now: ${invoiceUrl}

Please remit payment at your earliest convenience to avoid any late fees or service interruptions.

If you have already sent payment, please disregard this notice. If you have any questions or concerns about this invoice, please contact us immediately.

Thank you for your prompt attention to this matter.
    `.trim();

    return {
      subject: `${isOverdue ? 'Overdue' : 'Reminder'}: Invoice ${invoice.invoice_number} - ${balanceDue}`,
      html,
      text,
    };
  }
}