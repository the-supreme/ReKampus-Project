import React, { useState, useEffect } from 'react';
import { auth, db, loginWithGoogle } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { uploadImageToCloudinary } from './upload';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Shirt, ShoppingBag, PlusCircle, LogOut, ShoppingCart, History, Sparkles, Tag, Menu, X } from 'lucide-react';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [activeTab, setActiveTab] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlightedItemIds, setHighlightedItemIds] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Set document title
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
          q = query(collection(db, "items"), where("buyerId", "==", user.uid), where("status", "==", "SOLD"));
        }
      }
      
      if (q) {
        const snapshot = await getDocs(q);
        setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
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

  const updateItemStatus = async (itemId, newStatus) => {
    await updateDoc(doc(db, "items", itemId), { status: newStatus });
    fetchItems();
  };

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
    <div className="min-h-screen bg-slate-50">
      {/* Full-Width Dynamic Responsive Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Shirt className="w-7 h-7 text-emerald-600" />
              <span className="font-bold text-xl text-slate-900 tracking-tight">
                ReKampus <span className="hidden sm:inline-block text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold ml-1 align-middle">{role}</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex flex-1 justify-center space-x-1 px-4">
              {role === 'STUDENT' && studentTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button 
                    key={tab.id} 
                    onClick={() => { setActiveTab(tab.id); setHighlightedItemIds([]); }} 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <Icon className="w-4 h-4" /> {tab.label}
                  </button>
                );
              })}
              {role === 'MODERATOR' && modTabs.map(tab => (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id)} 
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* User Profile & Mobile Menu Toggle */}
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

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-lg absolute w-full left-0 z-40">
            <div className="px-4 py-3 space-y-1">
              {(role === 'STUDENT' ? studentTabs : modTabs).map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button 
                    key={tab.id} 
                    onClick={() => { 
                      setActiveTab(tab.id); 
                      setHighlightedItemIds([]); 
                      setIsMobileMenuOpen(false); 
                    }} 
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Standard Grid Views (Thrift, Cart, Purchases, Sales, Pending Approval) */}
        {(activeTab === 'thrift' || activeTab === 'cart' || activeTab === 'purchases' || activeTab === 'my_listings' || activeTab === 'pending' || activeTab === 'manage_gear') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {loading ? (
              <p className="col-span-full text-center py-12 text-slate-500">Loading listings...</p>
            ) : items.length === 0 ? (
              <p className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">No items in this section yet.</p>
            ) : items.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <img src={item.imageUrl} className="w-full h-48 object-cover" alt={item.title} />
                <div className="p-4 flex flex-col flex-grow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-900 leading-tight">{item.title}</h3>
                    <span className="font-bold text-emerald-600 whitespace-nowrap ml-2">{item.price === 0 ? 'FREE' : `$${item.price}`}</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">{item.description}</p>
                  
                  {activeTab === 'cart' && (
                    <div className="mt-auto flex flex-col gap-2">
                      <button onClick={() => alert(`Contact seller to pay & collect: ${item.sellerEmail}`)} className="w-full bg-emerald-50 text-emerald-700 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-100 transition-colors">Contact Seller</button>
                      <button onClick={() => markAsPurchased(item.id)} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors">Mark as Bought</button>
                    </div>
                  )}

                  {activeTab === 'thrift' && (
                    <button onClick={() => addToCart(item.id)} className="mt-auto w-full bg-slate-900 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors">Add to Cart</button>
                  )}

                  {activeTab === 'my_listings' && (
                    <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
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
                    <div className="mt-auto flex gap-2">
                      <button onClick={() => updateItemStatus(item.id, 'APPROVED')} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors">Approve</button>
                      <button onClick={() => updateItemStatus(item.id, 'REJECTED')} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors">Reject</button>
                    </div>
                  )}

                  {role === 'MODERATOR' && activeTab === 'manage_gear' && (
                    <div className="mt-auto">
                      <p className="text-xs mb-2 font-semibold text-slate-500">Status: {item.status}</p>
                      {item.status === 'AVAILABLE' ? (
                        <button onClick={() => updateItemStatus(item.id, 'BORROWED')} className="w-full bg-amber-500 text-white py-2 rounded-lg font-semibold text-sm hover:bg-amber-600 transition-colors">Mark as Borrowed</button>
                      ) : (
                        <button onClick={() => updateItemStatus(item.id, 'AVAILABLE')} className="w-full bg-emerald-500 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-600 transition-colors">Mark as Returned</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Presentation Gear Hub featuring Multi-Item AI Fit Advisor Target Highlighting */}
        {activeTab === 'gear_hub' && role === 'STUDENT' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <h2 className="text-xl font-bold mb-4 text-slate-800">Available Presentation Gear</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {items.map(item => {
                  const isHighlighted = highlightedItemIds.includes(item.id);
                  return (
                    <div 
                      key={item.id} 
                      id={`gear-${item.id}`}
                      className={`bg-white rounded-xl border p-4 transition-all duration-300 relative ${
                        isHighlighted 
                          ? 'border-emerald-500 ring-4 ring-emerald-100 shadow-xl scale-[1.02] bg-emerald-50/30' 
                          : 'border-slate-200 shadow-sm hover:shadow-md'
                      }`}
                    >
                      {isHighlighted && (
                        <span className="absolute -top-3 left-4 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1 z-10 animate-bounce">
                          <Sparkles className="w-3.5 h-3.5" /> Recommended Piece
                        </span>
                      )}
                      
                      <img src={item.imageUrl} className="w-full h-40 object-cover rounded-lg mb-4" alt={item.title} />
                      <h3 className="font-bold text-lg text-slate-900 leading-tight">{item.title}</h3>
                      <p className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded w-fit my-2">
                        Size: {item.size} • Chest: {item.chestInches}"
                      </p>
                      <p className="text-sm text-slate-600 mb-4 line-clamp-2">{item.description}</p>
                      <button onClick={() => alert(`Reserved! Show this code at the APU Student Hub Desk: ${item.id.slice(0, 6).toUpperCase()}`)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg font-semibold text-sm transition-colors">
                        Reserve Gear
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* AI Advisor Panel */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit sticky top-24">
              <div className="flex items-center gap-2 mb-3 text-emerald-600">
                <Sparkles className="w-6 h-6" />
                <h3 className="font-bold text-lg text-slate-900">AI Fit Advisor</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">State your measurements or full outfit requests (blazers, trousers, or combinations). Gemini will find and highlight all matching cards simultaneously.</p>
              <AIFitAssistant items={items} onHighlightItems={(ids) => setHighlightedItemIds(ids)} />
            </div>
          </div>
        )}

        {/* Sell / Add Gear Form */}
        {(activeTab === 'add_listing' || activeTab === 'add_gear') && (
          <ItemForm role={role} user={user} setActiveTab={setActiveTab} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------
// Sub-components: ItemForm & Multi-Item AI Fit Assistant
// ---------------------------------------------------------

function ItemForm({ role, user, setActiveTab }) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('M');
  const [chestInches, setChestInches] = useState('38');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const imageUrl = await uploadImageToCloudinary(file);
      const isGear = role === 'MODERATOR';
      
      await addDoc(collection(db, "items"), {
        title,
        description,
        price: isGear ? 0 : parseFloat(price),
        category: isGear ? 'PRESENTATION_GEAR' : 'THRIFT',
        size: isGear ? size : null,
        chestInches: isGear ? parseFloat(chestInches) : null,
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
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">{role === 'MODERATOR' ? 'Add Presentation Gear' : 'List Secondhand Item'}</h2>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Item Title</label>
        <input type="text" placeholder="Calculus Textbook / Slim Fit Blazer" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Description</label>
        <textarea placeholder="Describe condition, color, flaws..." required value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm h-24 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none" />
      </div>
      
      {role === 'STUDENT' ? (
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Selling Price (RM)</label>
          <input type="number" placeholder="15.00" required value={price} onChange={e => setPrice(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Size Tag</label>
            <select value={size} onChange={e => setSize(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all">
              <option>S</option><option>M</option><option>L</option><option>XL</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Chest (Inches)</label>
            <input type="number" placeholder="38" required value={chestInches} onChange={e => setChestInches(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" />
          </div>
        </div>
      )}
      
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
        size: i.size, 
        chestInches: i.chestInches,
        description: i.description 
      }));

      const fullPrompt = `You are a tailoring fit advisor and dynamic fashion assistant.
      User Query: "${prompt}". 
      Available Inventory: ${JSON.stringify(inventoryData)}.
      
      Instructions:
      1. If the user asks for a single piece (e.g. blazer or trousers), pick the best matching item.
      2. If the user asks for a full outfit (e.g. blazer + pants, blouse + skirt), pick all matching pieces that form the complete look.
      
      Return a RAW JSON object ONLY (no markdown formatting, no code fences):
      {
        "recommendedItemIds": ["ID1", "ID2"],
        "explanation": "Short summary of why these pieces fit and look great together."
      }`;
      
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
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
        placeholder="E.g., I need a full suit for presentation: 38-inch chest blazer and matching trousers." 
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