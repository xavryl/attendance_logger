// src/components/Registration.jsx
import React, { useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore"; 
import "../App.css";

const Registration = () => {
  const [step, setStep] = useState(1); 
  const [rfid, setRfid] = useState("");
  
  // --- Name States ---
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");

  const [status, setStatus] = useState("idle"); // idle, checking, not-found, saving, success, error, duplicate-name, missing-fields

  // STEP 1: Check if RFID exists
  const handleCheckRfid = async (e) => {
    e.preventDefault();
    if (!rfid.trim()) return;

    setStatus("checking");
    try {
      const docRef = doc(db, "students", rfid.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Load existing split names
        setFirstName(data.firstName || "");
        setMiddleName(data.middleName || "");
        setLastName(data.lastName || "");
        
        // Fallback: If only old "name" exists, try to split it
        if (!data.firstName && data.name) {
             const parts = data.name.split(" ");
             if (parts.length > 0) setFirstName(parts[0]);
             if (parts.length > 1) setLastName(parts.slice(1).join(" "));
        }

        setStatus("idle");
        setStep(2); 
      } else {
        setStatus("not-found");
      }
      
    } catch (error) {
      console.error("Error checking ID:", error);
      setStatus("error");
    }
  };

  // STEP 2: Save Details
  const handleSave = async (e) => {
    e.preventDefault();
    
    const fName = firstName.trim();
    const mName = middleName.trim();
    const lName = lastName.trim();

    // 1. MANDATORY CHECK
    if (!fName || !lName) {
        setStatus("missing-fields");
        return;
    }

    // Create full name string
    const fullNameString = `${fName} ${mName} ${lName}`.replace(/\s+/g, " ").trim();

    setStatus("saving");

    try {
      // 2. Check for Duplicates (on Full Name)
      const q = query(collection(db, "students"), where("name", "==", fullNameString));
      const querySnapshot = await getDocs(q);
      
      let isDuplicate = false;
      querySnapshot.forEach((doc) => {
        if (doc.id !== rfid.trim()) {
          isDuplicate = true;
        }
      });

      if (isDuplicate) {
        setStatus("duplicate-name");
        return; 
      }

      // 3. Save Data
      await setDoc(doc(db, "students", rfid.trim()), {
        rfid: rfid.trim(),
        firstName: fName,
        middleName: mName,
        lastName: lName,
        name: fullNameString // Keep full name for easy display
      }, { merge: true });

      setStatus("success");

      setTimeout(() => {
        setRfid("");
        setFirstName("");
        setMiddleName("");
        setLastName("");
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
        
        <div className="kiosk-header">
          <h1>{step === 1 ? "Input RFID" : "Step 2: Update Details"}</h1>
          <p>{step === 1 ? "Enter the RFID number to search." : `Updating details for ID: ${rfid}`}</p>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <form onSubmit={handleCheckRfid}>
            <div className="kiosk-step">
              <label>RFID Tag Number</label>
              <input 
                type="text" 
                value={rfid}
                onChange={(e) => { setRfid(e.target.value); setStatus("idle"); }}
                placeholder="e.g. 917DC622"
                className={`kiosk-input rfid-box ${status === "not-found" ? "input-error" : ""}`}
                autoFocus
              />
              {status === "not-found" && (
                <p className="error-text">❌ RFID does not exist.</p>
              )}
            </div>
            <button type="submit" className="kiosk-btn">
              {status === "checking" ? "Checking..." : "Next ➔"}
            </button>
          </form>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <form onSubmit={handleSave}>
            
            {/* First Name (Mandatory) */}
            <div className="kiosk-step">
              <label>First Name <span style={{color: 'red'}}>*</span></label>
              <input 
                type="text" 
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setStatus("idle"); }}
                placeholder="e.g. Juan"
                className={`kiosk-input name-box ${status === "missing-fields" && !firstName ? "input-error" : ""}`}
              />
            </div>

            {/* Middle Name (Optional) */}
            <div className="kiosk-step">
              <label>Middle Name <span style={{fontWeight: 'normal', fontSize: '0.8em', color: '#6b7280'}}>(Optional)</span></label>
              <input 
                type="text" 
                value={middleName}
                onChange={(e) => { setMiddleName(e.target.value); setStatus("idle"); }}
                placeholder="e.g. Dela"
                className="kiosk-input name-box"
              />
            </div>

            {/* Last Name (Mandatory) */}
            <div className="kiosk-step">
              <label>Last Name <span style={{color: 'red'}}>*</span></label>
              <input 
                type="text" 
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); setStatus("idle"); }}
                placeholder="e.g. Cruz"
                className={`kiosk-input name-box ${(status === "duplicate-name" || (status === "missing-fields" && !lastName)) ? "input-error" : ""}`}
              />
               
              {/* Errors */}
              {status === "missing-fields" && (
                <p className="error-text">❌ First Name and Last Name are required.</p>
              )}
              {status === "duplicate-name" && (
                <p className="error-text">❌ This full name already exists on another card!</p>
              )}
            </div>

            <button type="submit" className={`kiosk-btn ${status}`}>
              {status === "saving" ? "Saving..." : status === "success" ? "✅ Saved!" : "Save Changes"}
            </button>
            
            <button type="button" onClick={handleBack} className="kiosk-btn-secondary" style={{ marginTop: "10px" }}>
              Back
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default Registration;