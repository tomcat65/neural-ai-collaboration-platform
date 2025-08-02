# Vida-Tea Project Quick Reference

**URGENT TEAM DIRECTIVE** - 2025-08-02

## 🔥 Firebase is the ONLY Backend Solution

```
Project ID: vida-tea
Status: OPERATIONAL AND READY
```

## 📂 Key File Locations

### Firebase Admin Panel
```
/home/tomcat65/projects/vida-tea-admin/js/firebase-admin.js
```

### QTrade Catalog Data (37 Products Ready)
```
/home/tomcat65/projects/vida-tea-admin/docs/catalog.json
```

### Frontend Project
```
/home/tomcat65/projects/tea-shop-frontend/
```

## 🚫 DO NOT USE - Wrong Projects
```
/home/tomcat65/projects/ecommerce-api/          ❌
/home/tomcat65/projects/ecommerce-api-project/  ❌
```

## ⚡ Immediate Action Required

### For Claude Desktop:
```javascript
// 1. Import catalog data
adminDB.importCatalogData(catalogData)

// 2. Test admin functions
adminDB.getProducts()
adminDB.getCertifications()
```

### For Cursor IDE:
```javascript
// 1. Connect Firebase to frontend
firebase.initializeApp(firebaseConfig)

// 2. Fetch products from Firestore
db.collection('products').get()
```

## 🎯 Firebase Collections
- `products` - QTrade Teas catalog (37 items)
- `orders` - Customer orders
- `certifications` - Supplier certifications  
- `users` - Admin/customer accounts
- `settings` - Site config & custom arrangements
- `analytics` - Business metrics

## 📊 QTrade Teas Data Highlights
- **Products**: 37 premium teas
- **Certifications**: USDA Organic, Fair Trade, Rainforest Alliance
- **Custom Arrangements**: Wedding favors, corporate gifts, spa packages
- **Supplier**: 26+ years organic tea experience

## 🔧 Quick Commands

### Import Catalog (Admin Panel)
```javascript
fetch('/docs/catalog.json')
  .then(response => response.json())
  .then(catalog => adminDB.importCatalogData(catalog));
```

### Test Firebase Connection
```javascript
firebase.firestore().collection('products').limit(1).get()
  .then(snapshot => console.log('Connected:', snapshot.size));
```

---
**Firebase is our backend. QTrade catalog is ready. Import data NOW.**