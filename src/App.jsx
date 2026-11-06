import React, { useState, useEffect } from 'react';
import { auth, db, loginWithGoogle } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { uploadImageToCloudinary } from './upload';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Shirt, ShoppingBag, PlusCircle, LogOut, ShoppingCart, History, Sparkles, Tag } from 'lucide-react';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'STUDENT' | 'MODERATOR'
  const [activeTab, setActiveTab] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlightedItemIds, setHighlightedItemIds] = useState([]);

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

  if (!user || !role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <Shirt className="w-16 h-16 text-indigo-600 mb-4" />
        <h1 className="text-3xl font-bold mb-2 text-slate-800 text-center">Campus Exchange & Gear Hub</h1>
        <p className="text-slate-500 mb-8 text-center max-w-sm">Buy, sell secondhand goods, and rent presentation gear instantly.</p>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
          <button onClick={() => handleRoleLogin('STUDENT')} className="w-full bg-indigo-600 text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition shadow-sm">
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
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Shirt className="w-7 h-7 text-indigo-600" />
          <span className="font-bold text-xl">Campus Hub <span className="text-xs bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full font-semibold ml-2">{role}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600 hidden sm:inline">{user.email}</span>
          <button onClick={() => signOut(auth)} className="p-2 text-slate-500 hover:text-red-600 rounded-full transition"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Unified Student Navigation (Buy + Sell + Manage) */}
        {role === 'STUDENT' && (
          <div className="flex flex-wrap gap-1.5 mb-8 bg-slate-200 p-1.5 rounded-xl max-w-3xl mx-auto">
            {[
              { id: 'thrift', label: 'Thrift Store', icon: ShoppingBag },
              { id: 'gear_hub', label: 'Presentation Gear', icon: Shirt },
              { id: 'cart', label: 'Cart', icon: ShoppingCart },
              { id: 'my_listings', label: 'My Sales & Listings', icon: Tag },
              { id: 'purchases', label: 'Purchases', icon: History },
              { id: 'add_listing', label: '+ Sell Item', icon: PlusCircle }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button 
                  key={tab.id} 
                  onClick={() => { setActiveTab(tab.id); setHighlightedItemIds([]); }} 
                  className={`flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition ${activeTab === tab.id ? 'bg-white shadow text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Moderator Navigation */}
        {role === 'MODERATOR' && (
          <div className="flex gap-2 mb-8 bg-slate-200 p-1 rounded-xl max-w-xl mx-auto">
            {['pending', 'add_gear', 'manage_gear'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize ${activeTab === tab ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Standard Grid Views (Thrift, Cart, Purchases, Sales, Pending Approval) */}
        {(activeTab === 'thrift' || activeTab === 'cart' || activeTab === 'purchases' || activeTab === 'my_listings' || activeTab === 'pending' || activeTab === 'manage_gear') && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <p className="col-span-full text-center py-12 text-slate-500">Loading listings...</p>
            ) : items.length === 0 ? (
              <p className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">No items in this section yet.</p>
            ) : items.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <img src={item.imageUrl} className="w-full h-48 object-cover" alt={item.title} />
                <div className="p-4 flex flex-col flex-grow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-900">{item.title}</h3>
                    <span className="font-bold text-indigo-600">{item.price === 0 ? 'FREE' : `$${item.price}`}</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">{item.description}</p>
                  
                  {/* Cart View Actions */}
                  {activeTab === 'cart' && (
                    <div className="mt-auto flex flex-col gap-2">
                      <button onClick={() => alert(`Contact seller to pay & collect: ${item.sellerEmail}`)} className="w-full bg-indigo-50 text-indigo-600 py-2 rounded-lg font-semibold text-sm">Contact Seller</button>
                      <button onClick={() => markAsPurchased(item.id)} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700">Mark as Bought</button>
                    </div>
                  )}

                  {/* Thrift Store Browse Action */}
                  {activeTab === 'thrift' && (
                    <button onClick={() => addToCart(item.id)} className="mt-auto w-full bg-slate-900 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-800 transition">Add to Cart</button>
                  )}

                  {/* My Sales & Listings Tracker */}
                  {activeTab === 'my_listings' && (
                    <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-500">Status:</span>
                        <span className={`font-semibold px-2 py-0.5 rounded ${item.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : item.status === 'SOLD' ? 'bg-purple-100 text-purple-700' : item.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.status}
                        </span>
                      </div>
                      {item.status === 'SOLD' && (
                        <div className="bg-purple-50 p-2 rounded-lg text-xs text-purple-900">
                          <strong>Purchased by:</strong> {item.buyerEmail || 'Campus Student'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Moderator Controls */}
                  {role === 'MODERATOR' && activeTab === 'pending' && (
                    <div className="mt-auto flex gap-2">
                      <button onClick={() => updateItemStatus(item.id, 'APPROVED')} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm">Approve</button>
                      <button onClick={() => updateItemStatus(item.id, 'REJECTED')} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold text-sm">Reject</button>
                    </div>
                  )}

                  {role === 'MODERATOR' && activeTab === 'manage_gear' && (
                    <div className="mt-auto">
                      <p className="text-xs mb-2 font-semibold text-slate-500">Status: {item.status}</p>
                      {item.status === 'AVAILABLE' ? (
                        <button onClick={() => updateItemStatus(item.id, 'BORROWED')} className="w-full bg-amber-500 text-white py-2 rounded-lg font-semibold text-sm">Mark as Borrowed</button>
                      ) : (
                        <button onClick={() => updateItemStatus(item.id, 'AVAILABLE')} className="w-full bg-emerald-500 text-white py-2 rounded-lg font-semibold text-sm">Mark as Returned</button>
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
                          ? 'border-indigo-600 ring-4 ring-indigo-200 shadow-xl scale-[1.02] bg-indigo-50/20' 
                          : 'border-slate-200 shadow-sm'
                      }`}
                    >
                      {isHighlighted && (
                        <span className="absolute -top-3 left-4 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1 z-10 animate-bounce">
                          <Sparkles className="w-3.5 h-3.5" /> Recommended Piece
                        </span>
                      )}
                      
                      <img src={item.imageUrl} className="w-full h-40 object-cover rounded-lg mb-4" alt={item.title} />
                      <h3 className="font-bold text-lg text-slate-900">{item.title}</h3>
                      <p className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded w-fit my-2">
                        Size: {item.size} • Chest: {item.chestInches}"
                      </p>
                      <p className="text-sm text-slate-600 mb-4 line-clamp-2">{item.description}</p>
                      <button onClick={() => alert(`Reserved! Show this code at the Student Hub Desk: ${item.id.slice(0, 6).toUpperCase()}`)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-semibold text-sm transition">
                        Reserve Gear
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* AI Advisor Panel */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit sticky top-24">
              <div className="flex items-center gap-2 mb-3 text-indigo-600">
                <Sparkles className="w-6 h-6" />
                <h3 className="font-bold text-lg">AI Fit Advisor</h3>
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
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-slate-800 mb-4">{role === 'MODERATOR' ? 'Add Presentation Gear' : 'List Secondhand Item'}</h2>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Item Title</label>
        <input type="text" placeholder="Calculus Textbook / Slim Fit Blazer" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
        <textarea placeholder="Describe condition, color, flaws..." required value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm h-24" />
      </div>
      
      {role === 'STUDENT' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Selling Price ($)</label>
          <input type="number" placeholder="15.00" required value={price} onChange={e => setPrice(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Size Tag</label>
            <select value={size} onChange={e => setSize(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm">
              <option>S</option><option>M</option><option>L</option><option>XL</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Chest Measurement (Inches)</label>
            <input type="number" placeholder="38" required value={chestInches} onChange={e => setChestInches(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm" />
          </div>
        </div>
      )}
      
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Photo</label>
        <input type="file" required onChange={e => setFile(e.target.files[0])} className="w-full p-2.5 border rounded-lg text-sm bg-slate-50" />
      </div>
      <button disabled={uploading} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg text-sm transition font-semibold">
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
        
        // Scroll to the first matched piece
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
        className="w-full p-3 border border-slate-300 rounded-lg text-sm h-24 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" 
      />
      <button 
        onClick={askGemini} 
        disabled={loading} 
        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
      >
        {loading ? 'Finding Best Fit...' : 'Find & Highlight Fit'}
      </button>
      {response && (
        <div className="mt-3 p-3.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs leading-relaxed text-indigo-950">
          <strong>Stylist Advisor:</strong> {response}
        </div>
      )}
    </div>
  );
}