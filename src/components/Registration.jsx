// src/components/Registration.jsx
import React, { useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "../App.css";

const Registration = () => {
  const [step, setStep] = useState(1); // 1 = Enter RFID, 2 = Enter Name
  const [rfid, setRfid] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle"); // idle, saving, success, error

  // STEP 1: Check if RFID exists when user clicks "Next"
  const handleCheckRfid = async (e) => {
    e.preventDefault();
    if (!rfid.trim()) return;

    setStatus("checking");
    try {
      const docRef = doc(db, "students", rfid.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists() && docSnap.data().name) {
        setName(docSnap.data().name); // Pre-fill name if found
      } else {
        setName(""); // Clear name if new
      }
      
      setStatus("idle");
      setStep(2); // Move to next step
    } catch (error) {
      console.error("Error checking ID:", error);
      setStatus("error");
    }
  };

  // STEP 2: Save the Name
  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setStatus("saving");
    try {
      await setDoc(doc(db, "students", rfid.trim()), {
        rfid: rfid.trim(),
        name: name.trim()
      }, { merge: true });

      setStatus("success");

      // Reset after 1.5 seconds so you can do the next one
      setTimeout(() => {
        setRfid("");
        setName("");
        setStep(1);
        setStatus("idle");
      }, 1500);

    } catch (error) {
      console.error("Error saving:", error);
      setStatus("error");
    }
  };

  const handleBack = () => {
    setStep(1);
    setStatus("idle");
  };

  return (
    <div className="kiosk-container">
      <div className="kiosk-card">
        
        {/* --- HEADER --- */}
        <div className="kiosk-header">
          <h1>
            {step === 1 ? "Step 1: Scan Card" : "Step 2: Enter Name"}
          </h1>
          <p>
            {step === 1 
              ? "Type the RFID number or scan the card." 
              : `Registering details for ID: ${rfid}`}
          </p>
        </div>

        {/* --- FORM STEP 1 (RFID) --- */}
        {step === 1 && (
          <form onSubmit={handleCheckRfid}>
            <div className="kiosk-step">
              <label>RFID Tag Number</label>
              <input 
                type="text" 
                value={rfid}
                onChange={(e) => setRfid(e.target.value)}
                placeholder="e.g. 917DC622"
                className="kiosk-input rfid-box"
                autoFocus
              />
            </div>
            <button type="submit" className="kiosk-btn">
              Next ➔
            </button>
          </form>
        )}

        {/* --- FORM STEP 2 (NAME) --- */}
        {step === 2 && (
          <form onSubmit={handleSave}>
            <div className="kiosk-step">
              <label>Student Full Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="kiosk-input name-box"
                autoFocus
              />
            </div>

            <button type="submit" className={`kiosk-btn ${status}`}>
              {status === "saving" ? "Saving..." : 
               status === "success" ? "✅ Saved!" : "Save Registration"}
            </button>
            
            <button 
              type="button" 
              onClick={handleBack} 
              className="kiosk-btn-secondary"
              style={{ marginTop: "10px" }}
            >
              Back
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default Registration;