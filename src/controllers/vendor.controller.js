const db = require('../config/mysql');
const auditService = require('../services/audit.service');

/**
 * Get Vendor Dashboard Data
 */
const getDashboard = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
        SELECT v.*, u.name as u_name, u.email as u_email
        FROM vendors v
        JOIN users u ON v.user_id = u.id
        WHERE v.user_id = ?
    `, [req.user.id]);
    const vendor = rows[0];

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found.',
      });
    }

    res.json({
      success: true,
      data: {
        vendor: {
          id: vendor.id,
          company_name: vendor.company_name,
          service_type: vendor.service_type,
          payment_status: vendor.payment_status,
          status: vendor.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Payment Status & Profile Details
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT v.*, u.name as u_name, u.email as u_email, u.phone as u_phone
      FROM vendors v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.user_id = ?
    `, [req.user.id]);
    
    let vendor = rows[0];
    if (!vendor) {
      const [fallback] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [req.user.id]);
      vendor = fallback[0];
    }

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found.',
      });
    }

    res.json({
      success: true,
      data: {
        company_name: vendor.company_name || '',
        contact_person: vendor.contact_person || vendor.u_name || '',
        email: vendor.email || vendor.u_email || req.user.email || '',
        phone: vendor.phone || vendor.u_phone || req.user.phone || '',
        address: vendor.address || '',
        service_type: vendor.service_type || '',
        payment_status: vendor.payment_status || 'pending',
        tax_id: vendor.tax_id || '',
        description: vendor.description || vendor.service_type || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Contract & Profile Details
 */
const updateContractDetails = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [req.user.id]);
    const vendor = rows[0];

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found.',
      });
    }

    const { company_name, contact_person, email, phone, address, service_type, description, tax_id } = req.body;

    const updates = [];
    const params = [];
    if (company_name !== undefined) { updates.push('company_name = ?'); params.push(company_name); }
    if (contact_person !== undefined) { updates.push('contact_person = ?'); params.push(contact_person); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (service_type !== undefined) { updates.push('service_type = ?'); params.push(service_type); }

    if (updates.length > 0) {
      params.push(vendor.id);
      await db.query(`UPDATE vendors SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    }

    // Sync users table if email or contact_person name is updated
    if (email || contact_person || phone) {
      const userUpdates = [];
      const userParams = [];
      if (email) { userUpdates.push('email = ?'); userParams.push(email); }
      if (contact_person) { userUpdates.push('name = ?'); userParams.push(contact_person); }
      if (phone) { userUpdates.push('phone = ?'); userParams.push(phone); }
      if (userUpdates.length > 0) {
        userParams.push(req.user.id);
        await db.query(`UPDATE users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = ?`, userParams);
      }
    }

    const [updated] = await db.query(`
      SELECT v.*, u.name as u_name, u.email as u_email, u.phone as u_phone 
      FROM vendors v 
      LEFT JOIN users u ON v.user_id = u.id 
      WHERE v.id = ?
    `, [vendor.id]);

    const updatedVendor = updated[0] || vendor;

    auditService.log({
      userId: req.user.id,
      action: 'UPDATE_CONTRACT',
      details: `Vendor (${company_name || updatedVendor.company_name || updatedVendor.contact_person}) updated contract profile details`,
      ipAddress: req.ip || req.socket?.remoteAddress
    });

    res.json({
      success: true,
      message: 'Profile details updated successfully.',
      data: {
        company_name: updatedVendor.company_name || '',
        contact_person: updatedVendor.contact_person || updatedVendor.u_name || '',
        email: updatedVendor.email || updatedVendor.u_email || '',
        phone: updatedVendor.phone || updatedVendor.u_phone || '',
        address: updatedVendor.address || '',
        service_type: updatedVendor.service_type || '',
        tax_id: tax_id || '',
        description: description || updatedVendor.service_type || ''
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get My Payments
 */
const getMyPayments = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [req.user.id]);
    const vendor = rows[0];

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found.',
      });
    }

    // Get transactions where vendor is the beneficiary
    const [transactions] = await db.query(`
        SELECT t.*, emp.company_name as emp_company_name
        FROM transactions t
        LEFT JOIN employers emp ON t.employer_id = emp.id
        WHERE t.user_id = ? AND t.type = 'vendor_payment' AND t.status = 'success'
        ORDER BY t.date DESC
    `, [req.user.id]);

    // Calculate totals
    const totalPaid = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const pendingAmount = vendor.payment_status === 'pending' ? 0 : 0; // Can be calculated from invoices

    res.json({
      success: true,
      data: {
        summary: {
          totalPaid: parseFloat(totalPaid.toFixed(2)),
          totalRevenue: parseFloat(totalPaid.toFixed(2)),
          totalContracts: 1,
          completedContracts: vendor.payment_status === 'paid' ? 1 : 0,
          pendingAmount: parseFloat(pendingAmount.toFixed(2)),
          pendingPayments: parseFloat(pendingAmount.toFixed(2)),
          paymentStatus: vendor.payment_status,
        },
        transactions: transactions.map(t => ({
          id: t.id,
          amount: parseFloat(t.amount || 0),
          description: t.description,
          employer: t.emp_company_name || 'N/A',
          date: t.date,
          reference: t.reference,
          status: 'Completed',
          paymentStatus: 'completed'
        })),
        payments: transactions.map(t => ({
          id: t.id,
          amount: parseFloat(t.amount || 0),
          date: t.date,
          status: 'Completed',
          contractId: 'CON-' + t.id
        })),
        contracts: [
          {
            id: 'CON-001',
            employer: 'Main Employer',
            amount: totalPaid,
            startDate: vendor.created_at,
            endDate: new Date(),
            status: vendor.payment_status === 'paid' ? 'Completed' : 'Active'
          }
        ]
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getPaymentStatus,
  updateContractDetails,
  getMyPayments,
};

