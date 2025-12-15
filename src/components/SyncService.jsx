import { useEffect } from "react";
import { rtdb, db } from "../firebase";
import { ref, onValue } from "firebase/database";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"; // <--- Removed unused 'collection' and 'addDoc'

const SyncService = () => {
  useEffect(() => {
    const rtdbRef = ref(rtdb, "attendance");

    const unsubscribe = onValue(rtdbRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const scans = Object.values(data);

      for (const scan of scans) {
        const { rfid, date, time } = scan;
        if (!rfid) continue;

        // --- JOB 1: LOG HISTORY (The "Attendance" Collection) ---
        // Create a unique ID combining RFID + Date + Time
        const logId = `${rfid}_${date}_${time}`; 
        const logRef = doc(db, "attendance", logId);
        
        // Save the log (merge: true prevents duplicates if React re-runs)
        await setDoc(logRef, {
          rfid: rfid,
          date: date,
          time: time,
          timestamp: serverTimestamp()
        }, { merge: true });


        // --- JOB 2: UPDATE REGISTRY (The "Students" Collection) ---
        const studentRef = doc(db, "students", rfid);
        const studentSnap = await getDoc(studentRef);

        // Only create a new student entry if they don't exist yet
        if (!studentSnap.exists()) {
          await setDoc(studentRef, {
            rfid: rfid,
            name: " " 
          });
          console.log(`New Student Registered: ${rfid}`);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
};

export default SyncService;