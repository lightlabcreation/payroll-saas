const db = require('../config/mysql');

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
 * Get Payment Status
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [req.user.id]);
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
        payment_status: vendor.payment_status,
        service_type: vendor.service_type,
        address: vendor.address,
        phone: vendor.phone,
        contact_person: vendor.contact_person,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Contract Details
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

    const { service_type, address, phone, contact_person } = req.body;

    const updates = [];
    const params = [];
    if (service_type !== undefined) { updates.push('service_type = ?'); params.push(service_type); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (contact_person !== undefined) { updates.push('contact_person = ?'); params.push(contact_person); }

    if (updates.length > 0) {
      params.push(vendor.id);
      await db.query(`UPDATE vendors SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    }

    const [updated] = await db.query('SELECT * FROM vendors WHERE id = ?', [vendor.id]);

    res.json({
      success: true,
      message: 'Contract details updated successfully.',
      data: updated[0],
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

