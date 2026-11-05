import React, { useState, useEffect } from "react";
import { auth, db, loginWithGoogle } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { uploadImageToCloudinary } from "./upload";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Shirt,
  ShoppingBag,
  PlusCircle,
  LogOut,
  CheckCircle,
  XCircle,
  ShoppingCart,
  History,
  MessageSquare,
  Sparkles,
} from "lucide-react";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'BUYER', 'SELLER', 'MODERATOR'
  const [activeTab, setActiveTab] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Auth & Role Setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role);
          setDefaultTab(userDoc.data().role);
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
    if (userRole === "BUYER") setActiveTab("thrift");
    if (userRole === "SELLER") setActiveTab("my_listings");
    if (userRole === "MODERATOR") setActiveTab("pending");
  };

  const handleRoleLogin = async (selectedRole) => {
    try {
      const loggedInUser = await loginWithGoogle();
      if (!loggedInUser) return;

      const userRef = doc(db, "users", loggedInUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: loggedInUser.email,
          role: selectedRole,
          createdAt: serverTimestamp(),
        });
        setRole(selectedRole);
      } else {
        setRole(userSnap.data().role);
      }
      setDefaultTab(selectedRole || userSnap.data().role);
    } catch (err) {
      console.error(err);
    }
  };

  // Data Fetching
  const fetchItems = async () => {
    if (!role || !activeTab) return;
    setLoading(true);
    try {
      let q;
      if (role === "MODERATOR" && activeTab === "pending") {
        q = query(collection(db, "items"), where("status", "==", "PENDING"));
      } else if (role === "MODERATOR" && activeTab === "manage_gear") {
        q = query(
          collection(db, "items"),
          where("category", "==", "PRESENTATION_GEAR"),
        );
      } else if (role === "SELLER") {
        q = query(collection(db, "items"), where("sellerId", "==", user.uid));
      } else if (role === "BUYER") {
        if (activeTab === "thrift") {
          q = query(
            collection(db, "items"),
            where("category", "==", "THRIFT"),
            where("status", "==", "APPROVED"),
          );
        } else if (activeTab === "gear_hub") {
          q = query(
            collection(db, "items"),
            where("category", "==", "PRESENTATION_GEAR"),
            where("status", "==", "AVAILABLE"),
          );
        } else if (activeTab === "cart") {
          q = query(
            collection(db, "items"),
            where("cartUserId", "==", user.uid),
            where("status", "==", "APPROVED"),
          );
        } else if (activeTab === "history") {
          q = query(
            collection(db, "items"),
            where("buyerId", "==", user.uid),
            where("status", "==", "SOLD"),
          );
        }
      }

      if (q) {
        const snapshot = await getDocs(q);
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  // Buyer Actions
  const addToCart = async (itemId) => {
    await updateDoc(doc(db, "items", itemId), { cartUserId: user.uid });
    alert("Added to cart!");
    fetchItems();
  };

  const markAsPurchased = async (itemId) => {
    await updateDoc(doc(db, "items", itemId), {
      status: "SOLD",
      buyerId: user.uid,
      cartUserId: null,
    });
    alert(
      "Item moved to your Purchase History. Please contact the seller to finalize payment and collection.",
    );
    fetchItems();
  };

  // Moderator Actions
  const updateItemStatus = async (itemId, newStatus) => {
    await updateDoc(doc(db, "items", itemId), { status: newStatus });
    fetchItems();
  };

  if (!user || !role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Shirt className="w-16 h-16 text-indigo-600 mb-4" />
        <h1 className="text-3xl font-bold mb-8 text-slate-800">
          Campus Thrift & Gear Hub
        </h1>
        <div className="flex gap-4">
          <button
            onClick={() => handleRoleLogin("BUYER")}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Login as Buyer
          </button>
          <button
            onClick={() => handleRoleLogin("SELLER")}
            className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition"
          >
            Login as Seller
          </button>
          <button
            onClick={() => handleRoleLogin("MODERATOR")}
            className="bg-slate-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-slate-900 transition"
          >
            Login as Moderator
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Shirt className="w-7 h-7 text-indigo-600" />
          <span className="font-bold text-xl">
            Campus Exchange{" "}
            <span className="text-sm bg-indigo-100 text-indigo-800 px-2 py-1 rounded ml-2">
              {role}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600">
            {user.email}
          </span>
          <button
            onClick={() => signOut(auth)}
            className="p-2 text-slate-500 hover:text-red-600 rounded-full transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Buyer Navigation */}
        {role === "BUYER" && (
          <div className="flex gap-2 mb-8 bg-slate-200 p-1 rounded-xl max-w-2xl mx-auto">
            {["thrift", "gear_hub", "cart", "history"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize ${activeTab === tab ? "bg-white shadow text-indigo-600" : "text-slate-600"}`}
              >
                {tab.replace("_", " ")}
              </button>
            ))}
          </div>
        )}

        {/* Seller Navigation */}
        {role === "SELLER" && (
          <div className="flex gap-2 mb-8 bg-slate-200 p-1 rounded-xl max-w-md mx-auto">
            {["my_listings", "add_listing"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize ${activeTab === tab ? "bg-white shadow text-emerald-600" : "text-slate-600"}`}
              >
                {tab.replace("_", " ")}
              </button>
            ))}
          </div>
        )}

        {/* Moderator Navigation */}
        {role === "MODERATOR" && (
          <div className="flex gap-2 mb-8 bg-slate-200 p-1 rounded-xl max-w-2xl mx-auto">
            {["pending", "add_gear", "manage_gear"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize ${activeTab === tab ? "bg-white shadow text-slate-900" : "text-slate-600"}`}
              >
                {tab.replace("_", " ")}
              </button>
            ))}
          </div>
        )}

        {/* Data Rendering Views */}
        {(activeTab === "thrift" ||
          activeTab === "cart" ||
          activeTab === "history" ||
          activeTab === "my_listings" ||
          activeTab === "pending" ||
          activeTab === "manage_gear") && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <p>Loading...</p>
            ) : items.length === 0 ? (
              <p className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                No items found.
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"
                >
                  <img
                    src={item.imageUrl}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-4 flex flex-col flex-grow">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg">{item.title}</h3>
                      <span className="font-bold text-indigo-600">
                        {item.price === 0 ? "FREE" : `$${item.price}`}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-2 line-clamp-2">
                      {item.description}
                    </p>

                    {role === "BUYER" && activeTab === "thrift" && (
                      <button
                        onClick={() => addToCart(item.id)}
                        className="mt-auto w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800"
                      >
                        Add to Cart
                      </button>
                    )}
                    {role === "BUYER" && activeTab === "cart" && (
                      <div className="mt-auto flex gap-2">
                        <button
                          onClick={() =>
                            alert(`Contact seller: ${item.sellerEmail}`)
                          }
                          className="flex-1 bg-indigo-50 text-indigo-600 py-2 rounded-lg font-medium"
                        >
                          Contact
                        </button>
                        <button
                          onClick={() => markAsPurchased(item.id)}
                          className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium"
                        >
                          Mark Bought
                        </button>
                      </div>
                    )}
                    {role === "MODERATOR" && activeTab === "pending" && (
                      <div className="mt-auto flex gap-2">
                        <button
                          onClick={() => updateItemStatus(item.id, "APPROVED")}
                          className="flex-1 bg-green-600 text-white py-2 rounded-lg"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => updateItemStatus(item.id, "REJECTED")}
                          className="flex-1 bg-red-600 text-white py-2 rounded-lg"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {role === "MODERATOR" && activeTab === "manage_gear" && (
                      <div className="mt-auto">
                        <p className="text-sm mb-2 font-medium">
                          Status: {item.status}
                        </p>
                        {item.status === "AVAILABLE" ? (
                          <button
                            onClick={() =>
                              updateItemStatus(item.id, "BORROWED")
                            }
                            className="w-full bg-orange-500 text-white py-2 rounded-lg"
                          >
                            Mark as Borrowed
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              updateItemStatus(item.id, "AVAILABLE")
                            }
                            className="w-full bg-green-500 text-white py-2 rounded-lg"
                          >
                            Mark as Returned
                          </button>
                        )}
                      </div>
                    )}
                    {role === "SELLER" && (
                      <div className="mt-auto pt-4 border-t border-slate-100">
                        <span
                          className={`text-sm font-semibold px-2 py-1 rounded ${item.status === "APPROVED" ? "bg-green-100 text-green-700" : item.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                        >
                          Status: {item.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Gear Hub with Gemini AI Fit Advisor */}
        {activeTab === "gear_hub" && role === "BUYER" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <h2 className="text-xl font-bold mb-4">
                Available Presentation Gear
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-slate-200 p-4"
                  >
                    <img
                      src={item.imageUrl}
                      className="w-full h-40 object-cover rounded-lg mb-4"
                    />
                    <h3 className="font-bold text-lg">{item.title}</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Size: {item.size} • Chest: {item.chestInches}"
                    </p>
                    <button
                      onClick={() =>
                        alert(
                          "Proceed to Student Hub Desk to borrow this item. ID: " +
                            item.id,
                        )
                      }
                      className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium"
                    >
                      Reserve Gear
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit sticky top-24">
              <div className="flex items-center gap-2 mb-4 text-indigo-600">
                <Sparkles className="w-6 h-6" />
                <h3 className="font-bold text-lg">AI Fit Advisor</h3>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Describe your measurements (e.g., "I usually wear medium,
                38-inch chest") and Gemini will recommend the best available
                blazer.
              </p>
              <AIFitAssistant items={items} />
            </div>
          </div>
        )}

        {/* Form Components for Selling and Gear Adding */}
        {(activeTab === "add_listing" || activeTab === "add_gear") && (
          <ItemForm role={role} user={user} setActiveTab={setActiveTab} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------
// Sub-components
// ---------------------------------------------------------

function ItemForm({ role, user, setActiveTab }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("M");
  const [chestInches, setChestInches] = useState("38");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const imageUrl = await uploadImageToCloudinary(file);
      const isGear = role === "MODERATOR";

      await addDoc(collection(db, "items"), {
        title,
        description,
        price: isGear ? 0 : parseFloat(price),
        category: isGear ? "PRESENTATION_GEAR" : "THRIFT",
        size: isGear ? size : null,
        chestInches: isGear ? parseFloat(chestInches) : null,
        imageUrl,
        sellerId: user.uid,
        sellerEmail: user.email,
        status: isGear ? "AVAILABLE" : "PENDING",
        createdAt: serverTimestamp(),
      });
      alert("Successfully added!");
      setActiveTab(isGear ? "manage_gear" : "my_listings");
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
    >
      <h2 className="text-xl font-bold mb-4">
        {role === "MODERATOR" ? "Add Presentation Gear" : "Sell an Item"}
      </h2>
      <input
        type="text"
        placeholder="Title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <textarea
        placeholder="Description (Color, Condition, Details)"
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-3 border rounded-lg h-24"
      />

      {role === "SELLER" ? (
        <input
          type="number"
          placeholder="Price ($)"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full p-3 border rounded-lg"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full p-3 border rounded-lg"
          >
            <option>S</option>
            <option>M</option>
            <option>L</option>
            <option>XL</option>
          </select>
          <input
            type="number"
            placeholder="Chest (Inches)"
            required
            value={chestInches}
            onChange={(e) => setChestInches(e.target.value)}
            className="w-full p-3 border rounded-lg"
          />
        </div>
      )}

      <input
        type="file"
        required
        onChange={(e) => setFile(e.target.files[0])}
        className="w-full p-3 border rounded-lg bg-slate-50"
      />
      <button
        disabled={uploading}
        type="submit"
        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg"
      >
        {uploading ? "Processing..." : "Submit"}
      </button>
    </form>
  );
}

function AIFitAssistant({ items }) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const askGemini = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const context = JSON.stringify(
        items.map((i) => ({
          title: i.title,
          size: i.size,
          chestInches: i.chestInches,
        })),
      );
      const fullPrompt = `You are a helpful virtual tailor. A student asks: "${prompt}". Based strictly on the following available inventory, recommend the best item and explain why it fits well. Be concise. Inventory: ${context}`;

      // Web SDK syntax
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
      const result = await model.generateContent(fullPrompt);

      setResponse(result.response.text());
    } catch (err) {
      console.error("Gemini API Error:", err);
      setResponse("Failed to connect to AI Advisor. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="E.g., I have a 40-inch chest and broad shoulders."
        className="w-full p-3 border border-slate-300 rounded-lg text-sm h-24"
      />
      <button
        onClick={askGemini}
        disabled={loading}
        className="w-full bg-slate-900 text-white font-medium py-2 rounded-lg"
      >
        {loading ? "Analyzing Fit..." : "Ask AI"}
      </button>
      {response && (
        <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-900">
          <strong>Advisor:</strong> {response}
        </div>
      )}
    </div>
  );
}
