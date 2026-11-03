const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// POST /api/installation-requests - العميل يطلب فني
exports.createRequest = async (req, res) => {
  try {
    const { type, address, lat, lng, city, customerName, customerPhone, orderId } = req.body;
    
    const validTypes = ['emergency_open','maintenance_only','install_from_outside','programming','install_with_order'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use: ' + validTypes.join(', ') });
    }
    
    const finalCity = city || req.user?.city || 'Riyadh';
    
    const request = await prisma.installationRequest.create({
      data: {
        type,
        address,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        city: finalCity,
        customerId: req.user?.id || null,
        customerName: customerName || req.user?.name || 'عميل',
        customerPhone: customerPhone || req.user?.phone || '',
        orderId: orderId || null,
        status: 'PENDING'
      }
    });
    
    res.json({ message: 'Request created', request });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

// GET /api/technician/requests - الفني يشوف طلبات مدينته
exports.getRequests = async (req, res) => {
  try {
    const techCity = req.user.city;
    const requests = await prisma.installationRequest.findMany({
      where: { city: techCity },
      orderBy: { createdAt: 'desc' }
    });
    res.json(requests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// POST /api/technician/requests/:id/accept
exports.acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.installationRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', technicianId: req.user.id }
    });
    res.json({ message: 'Accepted', request: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// POST /api/technician/requests/:id/status - on_the_way, completed etc
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, lat, lng, photos_after } = req.body;
    
    const data = { status };
    if (photos_after) data.photosAfter = photos_after;
    
    const updated = await prisma.installationRequest.update({
      where: { id },
      data
    });
    res.json({ message: 'Updated', request: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// POST /api/technician/requests/:id/complete
exports.completeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { photos_after } = req.body;
    const updated = await prisma.installationRequest.update({
      where: { id },
      data: { status: 'COMPLETED', photosAfter: photos_after || [] }
    });
    res.json({ message: 'Completed', request: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
