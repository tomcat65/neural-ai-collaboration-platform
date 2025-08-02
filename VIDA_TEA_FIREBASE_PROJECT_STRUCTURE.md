# Vida-Tea Firebase Project Structure Documentation

**Entity Type**: Firebase Project Configuration  
**Created**: 2025-08-02  
**Status**: Operational and Ready for Catalog Import

## 🔥 Firebase Project Core Details

### Project Configuration
```json
{
  "projectId": "vida-tea",
  "projectName": "Vida-Tea Wellness",
  "region": "us-central1",
  "status": "active",
  "services": ["firestore", "auth", "hosting", "storage", "analytics"]
}
```

### API Configuration
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyBh4BNjpxfY_dgt3FojKFMD7KEIisf1iWg",
    authDomain: "vida-tea.firebaseapp.com",
    projectId: "vida-tea",
    storageBucket: "vida-tea.firebasestorage.app",
    messagingSenderId: "669969532716",
    appId: "1:669969532716:web:02d938f0e13f73575f0e89",
    measurementId: "G-SS8PB0TT8D"
};
```

## 📊 Firestore Database Schema

### Collection: `products`
```javascript
{
  id: "vt_001", // Document ID
  name: "Organic Earl Grey",
  qtradeSku: "A10040",
  category: "Black Tea",
  subcategory: "Classic Wellness",
  description: "Premium organic Earl Grey with bergamot...",
  healthBenefits: ["antioxidants", "energy", "stress relief"],
  origin: "Sri Lanka",
  brewTime: "3-5 minutes",
  brewTemp: "200°F",
  caffeine: "high",
  organic: true,
  fairTrade: true,
  rainforestAlliance: false,
  kosher: true,
  customArrangement: true,
  featured: true,
  retailPrice: 24.99,
  servingSize: "1 tsp per 8oz",
  grade: "Leaf",
  caseWeight: "35 kg / 77 lbs",
  createdAt: timestamp,
  updatedAt: timestamp,
  status: "active"
}
```

### Collection: `orders`
```javascript
{
  id: "order_unique_id",
  customerId: "user_id",
  customerEmail: "customer@email.com",
  items: [
    {
      productId: "vt_001",
      quantity: 2,
      unitPrice: 24.99,
      customArrangement: {
        jarSize: "medium",
        occasion: "wedding favors",
        customLabel: "Sarah & Mike - June 2025"
      }
    }
  ],
  subtotal: 49.98,
  tax: 4.50,
  shipping: 8.99,
  total: 63.47,
  shippingAddress: {},
  billingAddress: {},
  paymentMethod: "stripe",
  paymentId: "pi_stripe_id",
  status: "pending", // pending, processing, shipped, delivered, cancelled
  orderDate: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Collection: `certifications`
```javascript
{
  id: "qtrade-teas", // Document ID
  supplierName: "QTrade Teas & Herbs",
  companyBackground: {
    founded: "1994",
    founderRole: "Agricultural advisor to the first organic tea garden",
    experience: "26+ years supporting North American organic tea market",
    location: "Los Angeles, California"
  },
  certifications: {
    usdaOrganic: {
      status: "Certified",
      certifier: "Quality Assurance International",
      description: "USDA certified organic teas and herbs"
    },
    fairTrade: {
      status: "Certified",
      achievement: "Largest contributor to Fair Trade USA in 2016"
    },
    rainforestAlliance: {
      status: "Certified",
      focus: "Conservation of forestry and sustainable livelihoods"
    }
  },
  displayEnabled: true,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Collection: `users`
```javascript
{
  id: "user_unique_id",
  email: "admin@vida-tea.com",
  role: "admin", // admin, customer
  profile: {
    firstName: "Admin",
    lastName: "User",
    phone: "+1234567890"
  },
  permissions: ["manage_products", "manage_orders", "view_analytics"],
  status: "active",
  lastLogin: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Collection: `settings`
```javascript
// Document: custom-arrangements
{
  jarSizes: [
    {
      size: "small",
      capacity: "2oz",
      basePrice: 15.00,
      occasions: ["individual gifts", "party favors"]
    }
  ],
  specialOccasions: ["Wedding Favors", "Corporate Events"],
  preDesignedBlends: [
    {
      name: "Relaxation Blend",
      combination: ["Chamomile", "Lavender", "Lemon Balm"],
      benefits: ["sleep support", "stress relief"]
    }
  ],
  pricingStructure: {
    bulkDiscounts: {
      "10-24 arrangements": "10% discount"
    }
  },
  createdAt: timestamp,
  updatedAt: timestamp
}

// Document: site-config
{
  siteName: "Vida-Tea Wellness",
  contactEmail: "info@vida-tea.com",
  businessHours: "Mon-Fri 9AM-5PM PST",
  shippingRates: {
    standard: 8.99,
    expedited: 15.99,
    overnight: 25.99
  },
  taxRate: 0.09,
  currency: "USD"
}
```

### Collection: `analytics`
```javascript
{
  id: "analytics_date_id",
  date: "2025-08-02",
  metrics: {
    pageViews: 1250,
    uniqueVisitors: 890,
    orders: 23,
    revenue: 1456.78,
    topProducts: ["vt_001", "vt_002", "vt_018"],
    conversionRate: 2.6,
    averageOrderValue: 63.34
  },
  traffic: {
    organic: 60,
    direct: 25,
    social: 10,
    referral: 5
  },
  createdAt: timestamp
}
```

## 🛠️ Firebase Admin Operations (Already Implemented)

### Admin Database Class Location
- **File**: `/home/tomcat65/projects/vida-tea-admin/js/firebase-admin.js`
- **Class**: `AdminDatabase`
- **Global Instance**: `window.adminDB`

### Available Methods
```javascript
// Catalog Import
adminDB.importCatalogData(catalogData)

// Product Management
adminDB.getProducts()
adminDB.getProduct(productId)
adminDB.updateProduct(productId, productData)
adminDB.deleteProduct(productId)

// Certification Management
adminDB.getCertifications()
adminDB.updateCertificationDisplay(certId, displayEnabled)

// Order Management
adminDB.getOrders()
adminDB.updateOrderStatus(orderId, status)

// User Management
adminDB.getAdminUsers()
adminDB.createAdminUser(userData)

// Analytics
adminDB.getAnalytics()
```

## 📁 QTrade Teas Catalog Data (Ready for Import)

### Catalog File Location
- **Path**: `/home/tomcat65/projects/vida-tea-admin/docs/catalog.json`
- **Products**: 37 premium tea products
- **Structure**: Complete with all required Firestore fields
- **Status**: Ready for batch import to Firestore

### Catalog Import Process
```javascript
// Load catalog data
fetch('/docs/catalog.json')
  .then(response => response.json())
  .then(catalogData => {
    // Import to Firestore
    return adminDB.importCatalogData(catalogData);
  })
  .then(() => {
    console.log('QTrade catalog imported successfully');
  });
```

## 🔐 Security Rules (Configured)

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Products - public read, admin write
    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.role == 'admin';
    }
    
    // Orders - user/admin access
    match /orders/{orderId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.customerId || 
         request.auth.token.role == 'admin');
    }
    
    // Admin only collections
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.token.role == 'admin';
    }
    
    match /analytics/{analyticsId} {
      allow read, write: if request.auth != null && request.auth.token.role == 'admin';
    }
  }
}
```

## 🚀 Deployment Configuration

### Firebase Hosting
- **Domain**: vida-tea.firebaseapp.com
- **Custom Domain**: (to be configured)
- **SSL**: Automatically provisioned
- **CDN**: Global Firebase CDN

### Build Configuration
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## 📋 Integration Status

### ✅ Completed
- Firebase project created and configured
- Firestore database structure defined
- Admin panel with full CRUD operations
- QTrade catalog data prepared
- Security rules implemented
- Batch import functionality coded

### ⏳ Pending
- Execute catalog data import to Firestore
- Connect frontend to Firebase
- Test admin panel with live data
- Deploy frontend to Firebase hosting
- Configure custom domain

### 🎯 Next Immediate Actions
1. Import QTrade catalog: `adminDB.importCatalogData(catalog)`
2. Test admin panel functionality
3. Connect frontend Firebase configuration
4. Deploy to Firebase hosting

---

**This Firebase project structure is complete and operational. The next step is importing the QTrade Teas catalog data to begin full system functionality.**