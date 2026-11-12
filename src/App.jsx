import React, { useState, useEffect } from 'react';
import { auth, db, loginWithGoogle } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { uploadImageToCloudinary } from './upload';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Shirt, ShoppingBag, PlusCircle, LogOut, ShoppingCart, History, Sparkles, Tag, Menu, X, Search, Filter } from 'lucide-react';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const CATEGORIES = [
  "Electronics & Gadgets", "Clothing & Apparel", "Textbooks & Notes",
  "Dorm Essentials", "Beauty & Personal Care", "Sports & Outdoors",
  "Shoes & Footwear", "Bags & Accessories", "Stationery & Supplies",
  "Video Games & Consoles", "Musical Instruments", "Collectibles & Toys", "Others"
];

const SCHOOL_FIELDS = [
  "Computer Science & IT", "Engineering & Robotics", "Business & Finance",
  "Media & Communication", "Art, Design & Animation", "Music & Performing Arts",
  "Medicine & Healthcare", "Law & Legal Studies", "Architecture", "Education", "Others"
];

const CONDITIONS = [
  "Brand New", "Like New", "Excellent", "Good", "Fair"
];

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [activeTab, setActiveTab] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlightedItemIds, setHighlightedItemIds] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCardId, setExpandedCardId] = useState(null);
  
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [fieldFilter, setFieldFilter] = useState('All');
  const [priceFilter, setPriceFilter] = useState('All');

  useEffect(() => {
    document.title = "ReKampus";
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userRole = userDoc.data().role;
          setRole(userRole);
          setDefaultTab(userRole);
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const setDefaultTab = (userRole) => {
    if (userRole === 'STUDENT') setActiveTab('thrift');
    if (userRole === 'MODERATOR') setActiveTab('pending');
  };

  const handleRoleLogin = async (selectedRole) => {
    try {
      const loggedInUser = await loginWithGoogle();
      if (!loggedInUser) return;
      
      const userRef = doc(db, 'users', loggedInUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: loggedInUser.email,
          role: selectedRole,
          createdAt: serverTimestamp()
        });
        setRole(selectedRole);
      } else {
        setRole(userSnap.data().role);
      }
      setDefaultTab(selectedRole || userSnap.data().role);
    } catch (err) {
      console.error("Login Error:", err);
    }
  };

  const fetchItems = async () => {
    if (!role || !activeTab) return;
    setLoading(true);
    try {
      let q;
      if (role === 'MODERATOR' && activeTab === 'pending') {
        q = query(collection(db, "items"), where("status", "==", "PENDING"));
      } else if (role === 'MODERATOR' && activeTab === 'manage_gear') {
        q = query(collection(db, "items"), where("category", "==", "PRESENTATION_GEAR"));
      } else if (role === 'STUDENT') {
        if (activeTab === 'thrift') {
          q = query(collection(db, "items"), where("category", "==", "THRIFT"), where("status", "==", "APPROVED"));
        } else if (activeTab === 'gear_hub') {
          q = query(collection(db, "items"), where("category", "==", "PRESENTATION_GEAR"), where("status", "==", "AVAILABLE"));
        } else if (activeTab === 'cart') {
          q = query(collection(db, "items"), where("cartUserId", "==", user.uid), where("status", "==", "APPROVED"));
        } else if (activeTab === 'my_listings') {
          q = query(collection(db, "items"), where("sellerId", "==", user.uid));
        } else if (activeTab === 'purchases') {
          q = query(collection(db, "items"), where("buyerId", "==", user.uid));
        }
      }
      
      if (q) {
        const snapshot = await getDocs(q);
        let fetchedItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter local state to avoid composite index requirements in Firestore
        if (activeTab === 'purchases') {
          fetchedItems = fetchedItems.filter(i => ["SOLD", "BORROWED", "RETURN_PENDING", "OVERDUE"].includes(i.status));
        }
        
        setItems(fetchedItems);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    setSearchQuery(''); 
  }, [activeTab, role]);

  const addToCart = async (itemId) => {
    await updateDoc(doc(db, "items", itemId), { cartUserId: user.uid });
    alert("Item added to cart!");
    fetchItems();
  };

  const markAsPurchased = async (itemId) => {
    await updateDoc(doc(db, "items", itemId), { 
      status: "SOLD", 
      buyerId: user.uid,
      buyerEmail: user.email,
      cartUserId: null 
    });
    alert("Item marked as purchased! Check your Purchase History.");
    fetchItems();
  };

  const reserveGear = async (item) => {
    const now = new Date();
    const due = new Date();
    due.setDate(due.getDate() + 3); // 3-day rental period
    
    await updateDoc(doc(db, "items", item.id), { 
      status: "BORROWED",
      buyerId: user.uid,
      buyerEmail: user.email,
      borrowedAt: now.toISOString(),
      dueDate: due.toISOString()
    });
    alert(`Reserved! Manage this item in your Purchases tab. Show this code at the APU Student Hub Desk: ${item.id.slice(0, 6).toUpperCase()}`);
    fetchItems();
  };

  const studentReturnGear = async (itemId) => {
    await updateDoc(doc(db, "items", itemId), { status: "RETURN_PENDING" });
    alert("Marked as returned! Waiting for moderator confirmation.");
    fetchItems();
  };

  const moderatorConfirmReturn = async (itemId) => {
    await updateDoc(doc(db, "items", itemId), { 
      status: "AVAILABLE",
      buyerId: null,
      buyerEmail: null,
      borrowedAt: null,
      dueDate: null
    });
    alert("Gear marked as returned and is now available.");
    fetchItems();
  };

  const updateItemStatus = async (itemId, newStatus) => {
    await updateDoc(doc(db, "items", itemId), { status: newStatus });
    fetchItems();
  };

  const changeTab = (tabId) => {
    setActiveTab(tabId);
    setHighlightedItemIds([]);
    setIsMobileMenuOpen(false);
    setSearchQuery('');
    setCategoryFilter('All');
    setFieldFilter('All');
    setPriceFilter('All');
    setExpandedCardId(null);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = (item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           item.description?.toLowerCase().includes(searchQuery.toLowerCase()));
                           
    const matchesCategory = categoryFilter === 'All' || item.itemCategory === categoryFilter;
    const matchesField = fieldFilter === 'All' || item.schoolField === fieldFilter;
    
    let matchesPrice = true;
    if (priceFilter === 'Free') matchesPrice = item.price === 0;
    else if (priceFilter === 'Under RM 20') matchesPrice = item.price > 0 && item.price < 20;
    else if (priceFilter === 'RM 20 - RM 50') matchesPrice = item.price >= 20 && item.price <= 50;
    else if (priceFilter === 'RM 50 - RM 100') matchesPrice = item.price > 50 && item.price <= 100;
    else if (priceFilter === 'Over RM 100') matchesPrice = item.price > 100;

    return matchesSearch && matchesCategory && matchesField && matchesPrice;
  });

  const studentTabs = [
    { id: 'thrift', label: 'Thrift Store', icon: ShoppingBag },
    { id: 'gear_hub', label: 'Presentation Gear', icon: Shirt },
    { id: 'cart', label: 'Cart', icon: ShoppingCart },
    { id: 'my_listings', label: 'My Listings', icon: Tag },
    { id: 'purchases', label: 'Purchases', icon: History },
    { id: 'add_listing', label: 'Sell Item', icon: PlusCircle }
  ];

  const modTabs = [
    { id: 'pending', label: 'Pending Approvals' },
    { id: 'add_gear', label: 'Add Gear' },
    { id: 'manage_gear', label: 'Manage Inventory' }
  ];

  if (!user || !role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <Shirt className="w-16 h-16 text-emerald-600 mb-4" />
        <h1 className="text-4xl font-bold mb-2 text-slate-800 text-center tracking-tight">ReKampus</h1>
        <p className="text-slate-500 mb-8 text-center max-w-sm">Sustainable secondhand goods and instant presentation gear rentals.</p>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
          <button onClick={() => handleRoleLogin('STUDENT')} className="w-full bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-emerald-700 transition shadow-sm">
            Sign In as Student
          </button>
          <button onClick={() => handleRoleLogin('MODERATOR')} className="w-full bg-slate-800 text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-slate-900 transition shadow-sm">
            Sign In as Moderator
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      
      {/* Invisible Click-to-Close Layer */}
      {expandedCardId && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setExpandedCardId(null)}
        />
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Shirt className="w-7 h-7 text-emerald-600" />
              <span className="font-bold text-xl text-slate-900 tracking-tight">
                ReKampus <span className="hidden sm:inline-block text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold ml-1 align-middle">{role}</span>
              </span>
            </div>

            <nav className="hidden md:flex flex-1 justify-center space-x-1 px-4">
              {role === 'STUDENT' && studentTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button 
                    key={tab.id} 
                    onClick={() => changeTab(tab.id)} 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <Icon className="w-4 h-4" /> {tab.label}
                  </button>
                );
              })}
              {role === 'MODERATOR' && modTabs.map(tab => (
                <button 
                  key={tab.id} 
                  onClick={() => changeTab(tab.id)} 
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm font-medium text-slate-600 hidden lg:inline">{user.email}</span>
              <button onClick={() => signOut(auth)} className="hidden md:flex p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition" title="Sign Out">
                <LogOut className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                className="md:hidden p-2 -mr-2 text-slate-600 hover:text-slate-900 focus:outline-none"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-lg absolute w-full left-0 z-40">
            <div className="px-4 py-3 space-y-1">
              {(role === 'STUDENT' ? studentTabs : modTabs).map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button 
                    key={tab.id} 
                    onClick={() => changeTab(tab.id)} 
                    className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg text-base font-semibold transition-colors ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {tab.icon && <tab.icon className="w-5 h-5" />}
                    {tab.label}
                  </button>
                );
              })}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="px-3 py-2 text-sm text-slate-500 truncate mb-2">{user.email}</div>
                <button onClick={() => signOut(auth)} className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-base font-semibold text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="w-5 h-5" /> Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        
        {/* Unified Search & Filters */}
        {['thrift', 'cart', 'purchases', 'my_listings', 'pending', 'manage_gear', 'gear_hub'].includes(activeTab) && (
          <div className="mb-6 flex flex-col md:flex-row gap-3">
            
            <div className="relative flex-grow max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search items by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
              />
            </div>

            {activeTab === 'thrift' && (
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-grow sm:flex-none">
                  <select 
                    value={categoryFilter} 
                    onChange={(e) => setCategoryFilter(e.target.value)} 
                    className="appearance-none pl-4 pr-10 py-2.5 w-full bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-slate-700 cursor-pointer h-full"
                  >
                    <option value="All">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <Filter className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>

                <div className="relative flex-grow sm:flex-none">
                  <select 
                    value={fieldFilter} 
                    onChange={(e) => setFieldFilter(e.target.value)} 
                    className="appearance-none pl-4 pr-10 py-2.5 w-full bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-slate-700 cursor-pointer h-full"
                  >
                    <option value="All">All Fields</option>
                    {SCHOOL_FIELDS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <Filter className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>

                <div className="relative flex-grow sm:flex-none">
                  <select 
                    value={priceFilter} 
                    onChange={(e) => setPriceFilter(e.target.value)} 
                    className="appearance-none pl-4 pr-10 py-2.5 w-full bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-slate-700 cursor-pointer h-full"
                  >
                    <option value="All">All Prices</option>
                    <option value="Free">Free (Donations)</option>
                    <option value="Under RM 20">Under RM 20</option>
                    <option value="RM 20 - RM 50">RM 20 - RM 50</option>
                    <option value="RM 50 - RM 100">RM 50 - RM 100</option>
                    <option value="Over RM 100">Over RM 100</option>
                  </select>
                  <Filter className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Standard Grid Views */}
        {(activeTab === 'thrift' || activeTab === 'cart' || activeTab === 'purchases' || activeTab === 'my_listings' || activeTab === 'pending' || activeTab === 'manage_gear') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {loading ? (
              <p className="col-span-full text-center py-12 text-slate-500">Loading listings...</p>
            ) : filteredItems.length === 0 ? (
              <p className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">No items found matching your criteria.</p>
            ) : filteredItems.map(item => {
              const isExpanded = expandedCardId === item.id;
              const hasLongDescription = item.description?.length > 90;
              
              const renderCard = (isOverlay) => (
                <div 
                  onClick={() => setExpandedCardId(isOverlay ? null : (isExpanded ? null : item.id))}
                  className={`bg-white rounded-xl border flex flex-col cursor-pointer group transition-all duration-300 ${
                    isOverlay 
                      ? 'absolute top-0 left-0 w-full min-h-full border-emerald-500 shadow-2xl ring-4 ring-emerald-500/20' 
                      : `border-slate-200 shadow-sm hover:shadow-md relative h-full overflow-hidden ${isExpanded ? 'opacity-0 pointer-events-none' : ''}`
                  }`}
                >
                  <img src={item.imageUrl} className={`w-full object-cover ${isOverlay ? 'h-64 rounded-t-xl' : 'h-48 group-hover:opacity-95 transition-opacity'}`} alt={item.title} />
                  
                  <div className="p-4 flex flex-col flex-grow">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-slate-900 leading-tight pr-2">{item.title}</h3>
                      <span className={`font-bold whitespace-nowrap ml-2 ${item.price === 0 ? 'text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 text-sm' : 'text-emerald-600'}`}>
                        {item.price === 0 ? 'FREE' : `RM ${item.price}`}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.condition && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase">{item.condition}</span>}
                      {item.itemCategory && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase">{item.itemCategory}</span>}
                      {item.schoolField && <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded uppercase">{item.schoolField}</span>}
                      {item.size && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">Size {item.size}</span>}
                      {item.chestInches && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">Chest {item.chestInches}"</span>}
                      {item.waistInches && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">Waist {item.waistInches}"</span>}
                    </div>

                    <p className={`text-sm text-slate-600 ${isOverlay ? 'whitespace-pre-wrap mb-4' : 'line-clamp-2 mb-1'}`}>
                      {item.description}
                    </p>
                    
                    {hasLongDescription && (
                      <span className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 mb-4 block">
                        {isOverlay ? 'Show less' : 'Read more'}
                      </span>
                    )}
                    {!hasLongDescription && <div className="mb-4 flex-grow"></div>}
                    
                    <div className="mt-auto pt-3 border-t border-transparent flex flex-col gap-2">
                      {activeTab === 'cart' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); alert(`Contact seller to pay & collect: ${item.sellerEmail}`); }} className="w-full bg-emerald-50 text-emerald-700 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-100 transition-colors">Contact Seller</button>
                          <button onClick={(e) => { e.stopPropagation(); markAsPurchased(item.id); }} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors">Mark as Bought</button>
                        </>
                      )}

                      {activeTab === 'thrift' && (
                        <button onClick={(e) => { e.stopPropagation(); addToCart(item.id); }} className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors">Add to Cart</button>
                      )}

                      {activeTab === 'purchases' && (
                        <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-slate-100">
                          {item.category === 'PRESENTATION_GEAR' ? (
                            <>
                              <div className="flex justify-between items-center text-xs mb-2">
                                <span className="font-medium text-slate-500">Rental Status:</span>
                                <span className={`font-semibold px-2 py-0.5 rounded ${item.status === 'BORROWED' ? 'bg-amber-100 text-amber-700' : item.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {item.status.replace('_', ' ')}
                               </span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-lg text-xs text-slate-600 border border-slate-100 mb-2 leading-relaxed">
                                 <strong>Borrowed:</strong> {item.borrowedAt ? new Date(item.borrowedAt).toLocaleDateString() : 'N/A'}<br/>
                                 <strong>Return By:</strong> {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'N/A'}
                              </div>
                              {item.status === 'BORROWED' || item.status === 'OVERDUE' ? (
                                <button onClick={(e) => { e.stopPropagation(); studentReturnGear(item.id); }} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-colors">Mark as Returned</button>
                              ) : (
                                <span className="text-center w-full block bg-slate-100 text-slate-500 py-2 rounded-lg font-semibold text-sm">Return Pending Approval</span>
                              )}
                            </>
                          ) : (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-medium text-slate-500">Status:</span>
                              <span className="font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">PURCHASED</span>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'my_listings' && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-between items-center text-xs mb-2">
                            <span className="font-medium text-slate-500">Status:</span>
                            <span className={`font-semibold px-2 py-0.5 rounded ${item.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : item.status === 'SOLD' ? 'bg-slate-200 text-slate-700' : item.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {item.status}
                            </span>
                          </div>
                          {item.status === 'SOLD' && (
                            <div className="bg-slate-50 p-2 rounded-lg text-xs text-slate-600 border border-slate-100">
                              <strong>Purchased by:</strong> {item.buyerEmail || 'Campus Student'}
                            </div>
                          )}
                        </div>
                      )}

                      {role === 'MODERATOR' && activeTab === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); updateItemStatus(item.id, 'APPROVED'); }} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors">Approve</button>
                          <button onClick={(e) => { e.stopPropagation(); updateItemStatus(item.id, 'REJECTED'); }} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors">Reject</button>
                        </div>
                      )}

                      {role === 'MODERATOR' && activeTab === 'manage_gear' && (
                        <div onClick={(e) => e.stopPropagation()} className="pt-2">
                          <div className="flex justify-between items-center text-xs mb-2">
                            <span className="font-medium text-slate-500">Status:</span>
                            <span className={`font-semibold px-2 py-0.5 rounded ${item.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700' : item.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {item.status.replace('_', ' ')}
                            </span>
                          </div>
                          
                          {item.status !== 'AVAILABLE' && (
                            <div className="bg-slate-50 p-2 rounded-lg text-xs text-slate-600 border border-slate-100 mb-3">
                              <strong>Borrower:</strong> {item.buyerEmail}<br/>
                              <strong>Due:</strong> {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'N/A'}
                            </div>
                          )}

                          {item.status === 'AVAILABLE' ? (
                            <button onClick={(e) => { e.stopPropagation(); updateItemStatus(item.id, 'BORROWED'); }} className="w-full bg-slate-200 text-slate-600 py-2 rounded-lg font-semibold text-sm hover:bg-slate-300 transition-colors">Manual Override: Mark Borrowed</button>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={(e) => { e.stopPropagation(); moderatorConfirmReturn(item.id); }} className="flex-1 bg-emerald-500 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-600 transition-colors">Confirm Return</button>
                              {item.status !== 'OVERDUE' && (
                                <button onClick={(e) => { e.stopPropagation(); updateItemStatus(item.id, 'OVERDUE'); }} className="flex-1 bg-red-500 text-white py-2 rounded-lg font-semibold text-sm hover:bg-red-600 transition-colors">Mark Overdue</button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
              
              return (
                <div key={item.id} className={`relative h-full ${isExpanded ? 'z-50' : 'z-0'}`}>
                  {renderCard(false)}
                  {isExpanded && renderCard(true)}
                </div>
              );
            })}
          </div>
        )}

        {/* Presentation Gear Hub */}
        {activeTab === 'gear_hub' && role === 'STUDENT' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <h2 className="text-xl font-bold mb-4 text-slate-800">Available Presentation Gear</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {filteredItems.map(item => {
                  const isHighlighted = highlightedItemIds.includes(item.id);
                  const isExpanded = expandedCardId === item.id;
                  const hasLongDescription = item.description?.length > 90;

                  const renderGearCard = (isOverlay) => (
                    <div 
                      id={!isOverlay ? `gear-${item.id}` : undefined}
                      onClick={() => setExpandedCardId(isOverlay ? null : (isExpanded ? null : item.id))}
                      className={`bg-white rounded-xl border flex flex-col cursor-pointer group transition-all duration-300 ${
                        isOverlay 
                          ? 'absolute top-0 left-0 w-full min-h-full border-emerald-500 shadow-2xl ring-4 ring-emerald-500/30' 
                          : `relative h-full overflow-hidden ${isExpanded ? 'opacity-0 pointer-events-none' : (isHighlighted ? 'border-emerald-500 ring-4 ring-emerald-100 shadow-xl bg-emerald-50/30 scale-[1.02]' : 'border-slate-200 shadow-sm hover:shadow-md')}`
                      }`}
                    >
                      {/* Highlight Badge */}
                      {isHighlighted && !isOverlay && (
                        <span className="absolute -top-3 left-4 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1 z-10 animate-bounce">
                          <Sparkles className="w-3.5 h-3.5" /> Recommended Piece
                        </span>
                      )}
                      {isHighlighted && isOverlay && (
                        <span className="absolute -top-3 left-4 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1 z-10">
                          <Sparkles className="w-3.5 h-3.5" /> Recommended Piece
                        </span>
                      )}
                      
                      <img src={item.imageUrl} className={`w-full object-cover ${isOverlay ? 'h-64 rounded-t-xl' : 'h-40 group-hover:opacity-95 transition-opacity'}`} alt={item.title} />
                      
                      <div className="p-4 flex flex-col flex-grow">
                        <h3 className="font-bold text-lg text-slate-900 leading-tight">{item.title}</h3>
                        
                        <div className="flex flex-wrap gap-1 my-2">
                           {item.condition && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase">{item.condition}</span>}
                           {item.size && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">Size {item.size}</span>}
                           {item.chestInches && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">Chest {item.chestInches}"</span>}
                           {item.waistInches && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">Waist {item.waistInches}"</span>}
                        </div>

                        <p className={`text-sm text-slate-600 ${isOverlay ? 'whitespace-pre-wrap mb-4' : 'line-clamp-2 mb-1'}`}>
                          {item.description}
                        </p>
                        
                        {hasLongDescription && (
                          <span className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 mb-4 block">
                            {isOverlay ? 'Show less' : 'Read more'}
                          </span>
                        )}
                        {!hasLongDescription && <div className="mb-4 flex-grow"></div>}
                        
                        <div className="mt-auto pt-3 border-t border-transparent">
                          <button 
                            onClick={(e) => { e.stopPropagation(); reserveGear(item); }} 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg font-semibold text-sm transition-colors mt-auto"
                          >
                            Reserve Gear
                          </button>
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <div key={item.id} className={`relative h-full ${isExpanded ? 'z-50' : 'z-0'}`}>
                      {renderGearCard(false)}
                      {isExpanded && renderGearCard(true)}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit sticky top-24 z-20">
              <div className="flex items-center gap-2 mb-3 text-emerald-600">
                <Sparkles className="w-6 h-6" />
                <h3 className="font-bold text-lg text-slate-900">AI Fit Advisor</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">State your measurements or full outfit requests (blazers, trousers, or combinations). Gemini will find and highlight all matching cards simultaneously.</p>
              <AIFitAssistant items={filteredItems} onHighlightItems={(ids) => setHighlightedItemIds(ids)} />
            </div>
          </div>
        )}

        {(activeTab === 'add_listing' || activeTab === 'add_gear') && (
          <ItemForm role={role} user={user} setActiveTab={setActiveTab} />
        )}
      </main>
    </div>
  );
}

function ItemForm({ role, user, setActiveTab }) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [itemCategory, setItemCategory] = useState(CATEGORIES[0]);
  const [schoolField, setSchoolField] = useState('');
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [size, setSize] = useState('');
  const [chestInches, setChestInches] = useState('');
  const [waistInches, setWaistInches] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const imageUrl = await uploadImageToCloudinary(file);
      const isGear = role === 'MODERATOR';
      
      const parsedPrice = parseFloat(price) || 0; 
      
      await addDoc(collection(db, "items"), {
        title,
        description,
        price: isGear ? 0 : parsedPrice,
        category: isGear ? 'PRESENTATION_GEAR' : 'THRIFT',
        itemCategory: isGear ? null : itemCategory,
        schoolField: schoolField || null,
        condition: condition,
        size: size || null,
        chestInches: chestInches ? parseFloat(chestInches) : null,
        waistInches: waistInches ? parseFloat(waistInches) : null,
        imageUrl,
        sellerId: user.uid,
        sellerEmail: user.email,
        status: isGear ? 'AVAILABLE' : 'PENDING',
        createdAt: serverTimestamp()
      });
      alert(isGear ? "Gear added to inventory!" : "Item submitted! Awaiting moderator approval.");
      setActiveTab(isGear ? 'manage_gear' : 'my_listings');
    } catch (err) {
      console.error("Item creation error:", err);
      alert("Failed to create item.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">{role === 'MODERATOR' ? 'Add Presentation Gear' : 'List Secondhand Item'}</h2>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Item Title</label>
        <input type="text" placeholder="Calculus Textbook / Slim Fit Blazer" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" />
      </div>

      {role === 'STUDENT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Category</label>
            <select value={itemCategory} onChange={e => setItemCategory(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white">
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Field (Opt)</label>
            <select value={schoolField} onChange={e => setSchoolField(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white">
              <option value="">General / Any</option>
              {SCHOOL_FIELDS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white">
              {CONDITIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Price (RM)</label>
            <input type="number" min="0" step="0.01" placeholder="Empty = FREE" value={price} onChange={e => setPrice(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Description</label>
        <textarea placeholder="Describe condition, color, flaws..." required value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm h-24 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none" />
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Size (Opt)</label>
          <select value={size} onChange={e => setSize(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all">
            <option value="">N/A</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Chest in (Opt)</label>
          <input type="number" placeholder="38" value={chestInches} onChange={e => setChestInches(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Waist in (Opt)</label>
          <input type="number" placeholder="32" value={waistInches} onChange={e => setWaistInches(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all" />
        </div>
      </div>
      
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Upload Photo</label>
        <input type="file" required onChange={e => setFile(e.target.files[0])} className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-slate-50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />
      </div>
      <button disabled={uploading} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-lg text-sm transition-colors shadow-sm mt-2">
        {uploading ? 'Uploading...' : 'Publish Listing'}
      </button>
    </form>
  );
}

function AIFitAssistant({ items, onHighlightItems }) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const askGemini = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const inventoryData = items.map(i => ({ 
        id: i.id, 
        title: i.title, 
        category: i.category,
        condition: i.condition,
        size: i.size, 
        chestInches: i.chestInches,
        waistInches: i.waistInches,
        schoolField: i.schoolField,
        description: i.description 
      }));

      const fullPrompt = `You are a tailoring fit advisor and dynamic fashion assistant.
      User Query: "${prompt}". 
      Available Inventory: ${JSON.stringify(inventoryData)}.
      
      Instructions:
      1. If the user asks for a single piece (e.g. blazer or trousers), pick the best matching item based on their waist/chest measurements.
      2. If the user asks for a full outfit (e.g. blazer + pants, blouse + skirt), pick all matching pieces that form the complete look.
      
      Return a RAW JSON object ONLY (no markdown formatting, no code fences):
      {
        "recommendedItemIds": ["ID1", "ID2"],
        "explanation": "Short summary of why these pieces fit and look great together."
      }`;
      
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(fullPrompt);
      
      const text = result.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);

      setResponse(parsed.explanation);

      if (parsed.recommendedItemIds && parsed.recommendedItemIds.length > 0) {
        onHighlightItems(parsed.recommendedItemIds);
        
        const firstElement = document.getElementById(`gear-${parsed.recommendedItemIds[0]}`);
        if (firstElement) {
          firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        onHighlightItems([]);
      }
    } catch (err) {
      console.error("AI Assistant Error:", err);
      setResponse("Could not process fit styling request. Please review available items manually.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <textarea 
        value={prompt} 
        onChange={e => setPrompt(e.target.value)} 
        placeholder="E.g., I need a full suit for presentation: 38-inch chest blazer and 32-inch waist trousers." 
        className="w-full p-3 border border-slate-300 rounded-lg text-sm h-24 focus:ring-2 focus:ring-emerald-500 outline-none resize-none transition-all" 
      />
      <button 
        onClick={askGemini} 
        disabled={loading} 
        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
      >
        {loading ? 'Finding Best Fit...' : 'Find & Highlight Fit'}
      </button>
      {response && (
        <div className="mt-3 p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-sm leading-relaxed text-emerald-950 shadow-inner">
          <strong className="block mb-1 text-emerald-800">Stylist Advisor:</strong> {response}
        </div>
      )}
    </div>
  );
}