const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, '../../uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir,{recursive:true});
const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null, uploadDir),
  filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// انشاء طلب
router.post('/', upload.array('media', 5), async (req,res)=>{
  try{
    const {type,city,address,latitude,longitude,customerName,customerPhone,note,country,countryCode,province,googleLink,paymentMethod} = req.body;
    const files = (req.files||[]).map(f=>'/uploads/'+f.filename);
    const request = await prisma.installationRequest.create({
      data:{
        type: type||'emergency_open',
        city: city||'',
        country: country||'',
        countryCode: countryCode||'',
        province: province||city||'',
        googleLink: googleLink||'',
        paymentMethod: paymentMethod||'cash',
        address: address||'',
        latitude: latitude? parseFloat(latitude) : null,
        longitude: longitude? parseFloat(longitude) : null,
        customerName: customerName||'عميل قفلاتي',
        customerPhone: customerPhone||'777000000',
        note: note||'',
        media: JSON.stringify(files),
        orderNumber: 'QF-' + Math.floor(100000 + Math.random()*900000),
          status: 'PENDING'
      }
    });
    res.json({success:true, request});
  }catch(e){ console.log(e); res.status(500).json({error:e.message}) }
});



// جيب طلب واحد - لصفحة التفاصيل اللي ارسلتها


// تحديث حالة موحد - يربط مع الازرار الثلاثة في تصميمك
router.put('/:id/status', async (req,res)=>{
  try{
    const {status} = req.body;
    const map = {
      pending:'PENDING', accepted:'ACCEPTED', on_the_way:'ON_THE_WAY',
      arrived:'ARRIVED', completed:'COMPLETED',
      PENDING:'PENDING', ACCEPTED:'ACCEPTED', ON_THE_WAY:'ON_THE_WAY', ARRIVED:'ARRIVED', COMPLETED:'COMPLETED'
    };
    const updated = await prisma.installationRequest.update({
      where:{ id:req.params.id },
      data:{ status: map[status]||status }
    });
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});

// القديم حقك نخليه
router.put('/:id/accept', async (req,res)=>{
  try{
    const {technicianId}=req.body;
    const updated=await prisma.installationRequest.update({ where:{ id:req.params.id }, data:{ status:'ACCEPTED', technicianId } });
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});
router.put('/:id/on-the-way', async (req,res)=>{
  try{
    const updated=await prisma.installationRequest.update({ where:{ id:req.params.id }, data:{ status:'ON_THE_WAY' }});
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});
router.put('/:id/complete', async (req,res)=>{
  try{
    const updated=await prisma.installationRequest.update({ where:{ id:req.params.id }, data:{ status:'COMPLETED' }});
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});



// جيب كل الطلبات - للفني والادمن
router.get('/', async (req,res)=>{
  try{
    const { countryCode, country, province, city, technicianId, status } = req.query;
    const where = {};
    if(countryCode) where.countryCode = countryCode;
    else if(country) where.country = country;
    if(province) where.province = province;
    else if(city) where.city = city;
    if(technicianId) where.technicianId = technicianId;
    if(status) where.status = status;
    // بدون فلتر = الادمن يشوف الكل
    // مع فلتر countryCode+province = المشرف يشوف محافظته بس
    const requests = await prisma.installationRequest.findMany({ where, orderBy:{ createdAt:"desc" }, include:{ technician:true } });
    res.json(requests);
  }catch(e){ res.status(500).json({ error:e.message }) }
});

// جيب طلب واحد
router.get('/:id', async (req,res)=>{
  try{
    const r = await prisma.installationRequest.findUnique({ where:{ id:req.params.id }, include:{ technician:true } });
    if(!r) return res.status(404).json({ error:"not found" });
    res.json(r);
  }catch(e){ res.status(500).json({ error:e.message }) }
});

module.exports = router;
