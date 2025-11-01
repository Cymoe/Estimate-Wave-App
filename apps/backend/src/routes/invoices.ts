import { Router, Request, Response } from 'express';
import { Invoice } from '../models';

const router = Router();

// GET all invoices for an organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientId, status } = req.query;
    const query: any = {};
    
    if (organizationId) query.organizationId = organizationId;
    if (clientId) query.clientId = clientId;
    if (status) query.status = status;
    
    const invoices = await Invoice.find(query).sort({ issueDate: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET invoice by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST create new invoice
router.post('/', async (req: Request, res: Response) => {
  try {
    const invoice = new Invoice(req.body);
    await invoice.save(); // Pre-save hook will calculate totals
    res.status(201).json(invoice);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(400).json({ error: 'Failed to create invoice' });
  }
});

// PATCH update invoice
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Update fields
    Object.assign(invoice, req.body);
    await invoice.save(); // Pre-save hook will recalculate totals
    
    res.json(invoice);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update invoice' });
  }
});

// DELETE invoice
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// POST mark invoice as paid
router.post('/:id/pay', async (req: Request, res: Response) => {
  try {
    const { amountPaid } = req.body;
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          amountPaid: amountPaid,
          paidDate: new Date(),
          status: 'paid',
        },
      },
      { new: true }
    );
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(invoice);
  } catch (error) {
    res.status(400).json({ error: 'Failed to mark invoice as paid' });
  }
});

export default router;

