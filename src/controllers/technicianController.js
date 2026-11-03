const prisma = require("../utils/prisma");
const { findTechnician } = require("../utils/technicianMatcher");

// الفني يشوف الطلبات المخصصة له في الرياض
exports.myAssigned = async (req,res)=>{
  const bookings = await prisma.booking.findMany({
    where:{ technicianId: req.user.id, city:"Riyadh" },
    include:{ order:{ include:{ items:{ include:{product:true}}}}},
    orderBy:{createdAt:'desc'}
  });
  res.json(bookings);
};

// الفني يرفع صور اتمام العمل ويقفل الطلب - هذا اهم جزء
exports.completeJob = async (req,res)=>{
  const { id } = req.params;
  const { images, notes } = req.body; // images = array of urls
  const updated = await prisma.booking.update({
    where:{id},
    data:{ status:"COMPLETED", completionImages: images, completionNotes: notes, completedAt: new Date() }
  });
  // قفل الاوردر الاساسي
  await prisma.order.update({ where:{id: updated.orderId}, data:{ status:"COMPLETED" }});
  res.json({ message: "Job completed - Riyadh ✅", booking: updated });
};
