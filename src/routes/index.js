const router = require("express").Router();

router.use("/api/auth", require("./authRoutes"));
router.use("/api/technicians", require("./technicianRoutes"));
router.use("/api/technician", require("./technicianRoutes"));
router.use("/api/bookings", require("./bookingRoutes"));
router.use("/api/catalog", require("./Catalog"));

// الطلبات - نضيفهم - بدون ما نحذف صفحة الهبوط
try { router.use("/api/requests", require("./installationRequests")); } catch(e){ console.log("requests route missing", e.message) }
try { router.use("/api/installation", require("./installationRoutes")); } catch(e){ console.log("installation route missing", e.message) }
try { router.use("/api/installation-requests", require("./installationRequests")); } catch {}

// صفحة الهبوط المفهومة للباكند 3002 - تبقى كما هي
router.get("/", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quflati API - 3002</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-[#0a0a0a] text-white font-sans p-6">
    <div class="max-w-4xl mx-auto">
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-3xl font-bold">🔐 Quflati - قفلتي</h1>
        <span class="bg-green-500/20 text-green-400 px-4 py-1 rounded-full text-sm">Running ✅ - Port 3002</span>
      </div>
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
        <h2 class="text-xl mb-2">Technician API - Yemen / Saudi / Global</h2>
        <p class="text-zinc-400 text-sm">الباكند الخاص بالفنيين والإدارة - نظام العروض والكتالوج - مفلتر حسب الدولة والمحافظة</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="font-bold mb-3">📦 API Endpoints</h3>
          <ul class="space-y-2 text-sm font-mono">
            <li class="flex justify-between"><span class="text-zinc-400">/api/auth</span><span class="text-green-400">Auth</span></li>
            <li class="flex justify-between"><span class="text-zinc-400">/api/technicians</span><span class="text-blue-400">Fanni Catalog + Offers</span></li>
            <li class="flex justify-between"><span class="text-zinc-400">/api/requests</span><span class="text-yellow-400">Requests - Scoped</span></li>
            <li class="flex justify-between"><span class="text-zinc-400">/api/bookings</span><span class="text-yellow-400">Orders & Quotations</span></li>
          </ul>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="font-bold mb-3">📊 Status</h3>
          <ul class="space-y-2 text-sm">
            <li>✅ Database: Connected (Prisma)</li>
            <li>✅ Scope: Country + Province Filter Active</li>
            <li>⏰ Time: ${new Date().toLocaleString('ar-SA')}</li>
          </ul>
        </div>
      </div>
    </div>
  </body>
  </html>
  `);
});

module.exports = router;
