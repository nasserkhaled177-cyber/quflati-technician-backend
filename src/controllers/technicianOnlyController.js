// A - خاص بالفني فقط - يستقبل الطلبات من المتجر
const prisma = require("../utils/prisma");
exports.getMyRequests = async (req,res)=>{
  const requests = await prisma.booking.findMany({ where: { city: req.user.city || "Riyadh" }, orderBy:{createdAt:'desc'} });
  res.json(requests);
};
exports.updateStatus = async (req,res)=>{
  const { id } = req.params;
  const { status, images } = req.body;
  const updated = await prisma.booking.update({ where:{id}, data:{status, completionImages: images} });
  res.json(updated);
};
