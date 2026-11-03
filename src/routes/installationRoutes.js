const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req,file,cb)=> cb(null, Date.now()+'-'+file.originalname)
});
const upload = multer({storage});

// دالة حساب المسافة للفني القريب
function getDistance(lat1,lon1,lat2,lon2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// العميل يرسل طلب
router.post('/', upload.array('media',4), async(req,res)=>{
  try{
    const {type,city,address,latitude,longitude,customerName,phone,customerPhone,note,paymentMethod}=req.body;
    const files=(req.files||[]).map(f=>'/uploads/'+f.filename);
    const orderNumber='QF-'+Date.now().toString().slice(-6);

    const request=await prisma.installationRequest.create({
      data:{
        orderNumber,
        type: type||'install_existing',
        city, address,
        latitude: parseFloat(latitude)||0,
        longitude: parseFloat(longitude)||0,
        customerName: customerName||'عميل',
        customerPhone: customerPhone||phone||'777',
        note, paymentMethod: paymentMethod||'cash',
        media: files,
        status:'pending'
      }
    });

    // جيب الفنيين القريبين < 10 كم ونفس المدينة
    const techs=await prisma.technician.findMany({where:{isOnline:true}});
    const nearby=techs.filter(t=>{
      if(!t.lat||!t.lng) return t.city===city;
      return getDistance(parseFloat(latitude),parseFloat(longitude),t.lat,t.lng) <= 15;
    });

    console.log(`طلب ${orderNumber} - الفنيين القريبين: ${nearby.length}`);
    res.json({...request, nearbyTechnicians: nearby.length});

  }catch(e){
    console.error(e);
    res.status(500).json({error:e.message});
  }
});

// كل الطلبات - للرقابة
router.get('/', async(req,res)=>{
  const data=await prisma.installationRequest.findMany({orderBy:{createdAt:'desc'}});
  res.json(data);
});

// طلبات الفني القريب
router.get('/nearby/:techId', async(req,res)=>{
  const tech=await prisma.technician.findUnique({where:{id:req.params.techId}});
  if(!tech) return res.json([]);
  const all=await prisma.installationRequest.findMany({where:{status:'pending'}});
  const near=all.filter(r=> getDistance(r.latitude,r.longitude,tech.lat,tech.lng) <=15);
  res.json(near);
});

// الفني يرسل عرض
router.post('/:id/offer', async(req,res)=>{
  const {technicianId,price,arrivalTime}=req.body;
  const offer=await prisma.offer.create({
    data:{requestId:req.params.id, technicianId, price:parseFloat(price), arrivalTime, expiresAt:new Date(Date.now()+5*60*1000)}
  });
  await prisma.installationRequest.update({where:{id:req.params.id}, data:{status:'offered'}});
  res.json(offer);
});

module.exports=router;
