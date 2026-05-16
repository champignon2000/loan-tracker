import React, { useEffect, useMemo, useState } from "react";

export default function LoanTrackerApp() {
  // ⚠️ ลิงก์ URL Web App จาก Google Apps Script ของคุณ
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxT9-iXuSqPQsMxwh07E8Mbv6U3-DHnfVRngM1oxU07FCTmZHtF4NyxQnNGdWapNNT_xg/exec";

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("today"); // เริ่มต้นที่แท็บวันนี้ต้องเก็บเงินทันที

  // ส่วนควบคุมหน้าต่างเด้ง (Modals)
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false); 
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);

  // ส่วนของฟอร์มข้อมูลอินพุต
  const [name, setName] = useState("");
  const [loanType, setLoanType] = useState("daily");
  const [principal, setPrincipal] = useState("");
  const [customCyclePayment, setCustomCyclePayment] = useState(""); 
  const [customDays, setCustomDays] = useState("");                 
  const [payAmount, setPayAmount] = useState("");

  // ดึงข้อมูลจาก Google Sheet หลังบ้าน
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(APPS_SCRIPT_URL);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomers(data);
        setError(null);
      }
    } catch (err) {
      setError("ไม่สามารถดึงข้อมูลได้ โปรดตรวจสอบการ Deploy หรือ URL หลังบ้าน");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // คำนวณดอกเบี้ยและยอดรวมอัตโนมัติตอนกรอกฟอร์ม
  const dynamicCalculation = useMemo(() => {
    const p = Number(principal) || 0;
    const cyclePay = Number(customCyclePayment) || 0;
    const days = Number(customDays) || 0;

    if (loanType === "daily") {
      const total = cyclePay * days;
      const interest = Math.max(total - p, 0);
      return { interest, total, cyclePayment: cyclePay, termDays: days };
    } else {
      return { interest: cyclePay, total: p, cyclePayment: cyclePay, termDays: days };
    }
  }, [loanType, principal, customCyclePayment, customDays]);

  // ฟังก์ชั่นคำนวณเงื่อนไข "วันนี้ต้องเก็บเงินหรือไม่?"
  const isDueToday = (customer) => {
    if (Number(customer.remain) <= 0) return false; // จ่ายครบแล้ว ไม่ต้องเก็บ
    if (customer.loanType === "daily") return true; // รายวัน ต้องเก็บทุกวัน

    if (customer.loanType === "interest") { // ดอกลอย คำนวณตามรอบวันตัดดอก
      try {
        const parts = customer.createdAt.split("/");
        if (parts.length === 3) {
          const createdDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          const today = new Date();
          const diffTime = Math.abs(today - createdDate);
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const cycle = Number(customer.termDays) || 1;
          return diffDays % cycle === 0;
        }
      } catch (e) {
        return true; 
      }
    }
    return true;
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setLoanType(customer.loanType);
    setPrincipal(customer.principal);
    setCustomCyclePayment(customer.cyclePayment);
    setCustomDays(customer.termDays);
    setShowEditModal(true);
  };

  const openHistoryModal = (customer) => {
    setSelectedCustomer(customer);
    setShowHistoryModal(true);
  };

  // ลบข้อมูลลูกหนี้
  const handleDeleteCustomer = async (customer) => {
    const confirmDelete = window.confirm(`⚠️ คุณแน่ใจใช่ไหมที่จะลบข้อมูลของ "${customer.name}" ออกจากระบบถาวร?`);
    if (!confirmDelete) return;

    try {
      setLoading(true);
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteLoan", id: customer.id })
      });
      const result = await res.json();
      if (result.success) { alert("ลบข้อมูลลูกหนี้เรียบร้อยแล้ว"); fetchData(); }
    } catch (err) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อลบข้อมูล"); } finally { setLoading(false); }
  };

  // สร้างสัญญากู้ใหม่
  const handleCreateLoan = async (e) => {
    e.preventDefault();
    if (!name || !principal || !customCyclePayment || !customDays) return alert("กรุณากรอกข้อมูลให้ครบทุกช่อง");

    const newLoan = {
      action: "createLoan", id: "C" + Date.now(), name, loanType,
      principal: Number(principal), interest: dynamicCalculation.interest, total: dynamicCalculation.total,
      paid: 0, remain: dynamicCalculation.total, termDays: dynamicCalculation.termDays,
      dailyAmount: dynamicCalculation.cyclePayment, cyclePayment: dynamicCalculation.cyclePayment,
      createdAt: new Date().toLocaleDateString("th-TH"),
    };

    try {
      setLoading(true);
      const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(newLoan) });
      const result = await res.json();
      if (result.success) { setShowAddModal(false); clearForm(); fetchData(); }
    } catch (err) { alert("เกิดข้อผิดพลาดในการบันทึก"); } finally { setLoading(false); }
  };

  // แก้ไขสัญญาเดิม
  const handleEditLoan = async (e) => {
    e.preventDefault();
    if (!name || !principal || !customCyclePayment || !customDays) return alert("กรุณากรอกข้อมูลให้ครบ");

    const paid = Number(editingCustomer.paid || 0);
    const newTotal = dynamicCalculation.total;
    const newRemain = Math.max(newTotal - paid, 0);

    const updatedData = {
      action: "editLoan", id: editingCustomer.id, name, loanType,
      principal: Number(principal), interest: dynamicCalculation.interest, total: newTotal,
      remain: newRemain, termDays: dynamicCalculation.termDays,
      dailyAmount: dynamicCalculation.cyclePayment, cyclePayment: dynamicCalculation.cyclePayment,
    };

    try {
      setLoading(true);
      const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(updatedData) });
      const result = await res.json();
      if (result.success) { setShowEditModal(false); setEditingCustomer(null); clearForm(); fetchData(); }
    } catch (err) { alert("แก้ไขไม่สำเร็จ"); } finally { setLoading(false); }
  };

  // บันทึกการเก็บเงินค่างวด
  const handlePayment = async (e) => {
    e.preventDefault();
    if (!payAmount || !selectedCustomer) return;
    try {
      setLoading(true);
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "receivePayment", customerId: selectedCustomer.id, amount: Number(payAmount) }),
      });
      const result = await res.json();
      if (result.success) { setShowPayModal(false); setPayAmount(""); setSelectedCustomer(null); fetchData(); }
    } catch (err) { alert("บันทึกรับเงินล้มเหลว"); } finally { setLoading(false); }
  };

  const clearForm = () => { setName(""); setPrincipal(""); setCustomCyclePayment(""); setCustomDays(""); };

  // การกรองข้อมูลตามแท็บและช่องค้นหา
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search);
    if (!matchesSearch) return false;

    if (activeTab === "today") return isDueToday(c);
    if (activeTab === "daily") return c.loanType === "daily";
    if (activeTab === "interest") return c.loanType === "interest";
    return true; 
  });

  // คำนวณยอดรวมต่างๆ แสดงผลด้านบน
  const summary = useMemo(() => {
    return customers.reduce((acc, c) => {
      acc.totalPrincipal += Number(c.principal || 0);
      acc.totalRemain += Number(c.remain || 0);
      acc.totalPaid += Number(c.paid || 0);
      if (isDueToday(c)) acc.todayTargetAmount += Number(c.cyclePayment || 0); 
      return acc;
    }, { totalPrincipal: 0, totalRemain: 0, totalPaid: 0, todayTargetAmount: 0 });
  }, [customers]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "15px", backgroundColor: "#f3f4f6", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1350px", margin: "0 auto" }}>
        
        {/* หัวข้อเว็บแอป */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ fontSize: "20px", margin: 0 }}>✏️ ระบบเก็บเงินกู้อิสระ (กำหนดวัน/ยอดชำระเอง)</h2>
          <button onClick={() => { clearForm(); setLoanType("daily"); setShowAddModal(true); }} style={{ padding: "10px 15px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
            + เปิดสัญญาใหม่
          </button>
        </div>

        {/* บล็อกสรุปผลตัวเลข */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px", marginBottom: "15px" }}>
          <div style={{ padding: "15px", backgroundColor: "#fff", borderRadius: "8px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}><p style={{ color: "#6b7280", margin: "0", fontSize: "14px" }}>เงินต้นรวมทั้งหมด</p><h3 style={{ margin: "5px 0 0 0" }}>{summary.totalPrincipal.toLocaleString()} บ.</h3></div>
          <div style={{ padding: "15px", backgroundColor: "#fff", borderRadius: "8px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}><p style={{ color: "#b91c1c", margin: "0", fontSize: "14px" }}>ยอดค้างชำระรวม</p><h3 style={{ color: "#b91c1c", margin: "5px 0 0 0" }}>{summary.totalRemain.toLocaleString()} บ.</h3></div>
          <div style={{ padding: "15px", backgroundColor: "#fff", borderRadius: "8px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}><p style={{ color: "#15803d", margin: "0", fontSize: "14px" }}>เก็บเงินกลับมาแล้ว</p><h3 style={{ color: "#15803d", margin: "5px 0 0 0" }}>{summary.totalPaid.toLocaleString()} บ.</h3></div>
          <div style={{ padding: "15px", backgroundColor: "#fef3c7", borderRadius: "8px", border: "1px solid #f59e0b", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}><p style={{ color: "#d97706", margin: "0", fontWeight: "bold", fontSize: "14px" }}>🎯 เป้าหมายยอดเก็บวันนี้</p><h3 style={{ color: "#d97706", margin: "5px 0 0 0" }}>{summary.todayTargetAmount.toLocaleString()} บ.</h3></div>
        </div>

        {/* ช่องค้นหา */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
          <input type="text" placeholder="🔍 ค้นหาด้วยชื่อลูกหนี้ หรือรหัส..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "10px", flex: 1, borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }} />
        </div>
        
        {/* แถบตัวกรอง (Tabs) */}
        <div style={{ display: "flex", gap: "5px", marginBottom: "15px", flexWrap: "wrap" }}>
          <button onClick={() => setActiveTab("today")} style={{ padding: "10px 15px", borderRadius: "6px", cursor: "pointer", backgroundColor: activeTab === "today" ? "#d97706" : "#fff", color: activeTab === "today" ? "#fff" : "#111827", border: "1px solid #d1d5db", fontWeight: "bold" }}>📅 วันนี้ต้องเก็บ ({customers.filter(isDueToday).length})</button>
          <button onClick={() => setActiveTab("all")} style={{ padding: "10px 15px", borderRadius: "6px", cursor: "pointer", backgroundColor: activeTab === "all" ? "#111827" : "#fff", color: activeTab === "all" ? "#fff" : "#111827", border: "1px solid #d1d5db" }}>ทั้งหมด ({customers.length})</button>
          <button onClick={() => setActiveTab("daily")} style={{ padding: "10px 15px", borderRadius: "6px", cursor: "pointer", backgroundColor: activeTab === "daily" ? "#2563eb" : "#fff", color: activeTab === "daily" ? "#fff" : "#111827", border: "1px solid #d1d5db" }}>แบบรายวัน</button>
          <button onClick={() => setActiveTab("interest")} style={{ padding: "10px 15px", borderRadius: "6px", cursor: "pointer", backgroundColor: activeTab === "interest" ? "#db2777" : "#fff", color: activeTab === "interest" ? "#fff" : "#111827", border: "1px solid #d1d5db" }}>แบบดอกลอย</button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "15px", fontWeight: "bold", color: "#2563eb" }}>🔄 กำลังเชื่อมต่อฐานข้อมูล...</div>}
        {error && <div style={{ color: "#b91c1c", backgroundColor: "#fef2f2", padding: "12px", borderRadius: "6px", marginBottom: "15px" }}>{error}</div>}

        {/* ตารางแสดงรายชื่อ */}
        <div style={{ backgroundColor: "#fff", borderRadius: "8px", overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "900px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px" }}>ชื่อลูกหนี้</th>
                <th style={{ padding: "12px" }}>ประเภทสัญญา</th>
                <th style={{ padding: "12px" }}>เงินต้น</th>
                <th style={{ padding: "12px" }}>ยอดรวมตามสัญญา</th>
                <th style={{ padding: "12px" }}>ชำระแล้ว</th>
                <th style={{ padding: "12px" }}>ค้างชำระปัจจุบัน</th>
                <th style={{ padding: "12px" }}>แผนการส่งเงิน</th>
                <th style={{ padding: "12px", width: "260px" }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "#6b7280", fontWeight: "bold" }}>🎉 สบายใจได้! ไม่มีรายชื่อลูกหนี้ค้างชำระในกลุ่มนี้แล้ว</td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: isDueToday(c) && activeTab === "all" ? "#fffbeb" : "#fff" }}>
                    <td style={{ padding: "12px", fontWeight: "bold" }}>{c.name}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ padding: "3px 6px", borderRadius: "4px", fontSize: "12px", backgroundColor: c.loanType === "daily" ? "#eff6ff" : "#fdf2f8", color: c.loanType === "daily" ? "#1e40af" : "#9d174d", fontWeight: "bold" }}>
                        {c.loanType === "daily" ? "กำหนดวันจบ" : "ดอกลอยตามรอบ"}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>{Number(c.principal || 0).toLocaleString()}</td>
                    <td style={{ padding: "12px" }}>{c.loanType === "daily" ? `${Number(c.total || 0).toLocaleString()} บ. (${c.termDays} วัน)` : `ส่งดอกลอยเรื่อยๆ`}</td>
                    <td style={{ padding: "12px", color: "#15803d", fontWeight: "bold" }}>{Number(c.paid || 0).toLocaleString()}</td>
                    <td style={{ padding: "12px", color: "#b91c1c", fontWeight: "bold" }}>{Number(c.remain || 0).toLocaleString()} บ.</td>
                    <td style={{ padding: "12px", color: "#4b5563" }}>
                      {c.loanType === "daily" ? `ต้องส่งวันละ ${Number(c.cyclePayment || 0).toLocaleString()} บ.` : `ส่งดอกรอบละ ${Number(c.cyclePayment || 0).toLocaleString()} บ. ทุก ${c.termDays} วัน`}
                    </td>
                    <td style={{ padding: "12px", display: "flex", gap: "5px" }}>
                      <button onClick={() => { setSelectedCustomer(c); setShowPayModal(true); }} style={{ padding: "6px 10px", backgroundColor: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>💵 เก็บเงิน</button>
                      <button onClick={() => openHistoryModal(c)} style={{ padding: "6px 10px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>📜 ประวัติ</button>
                      <button onClick={() => openEditModal(c)} style={{ padding: "6px 10px", backgroundColor: "#f59e0b", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>✏️ แก้ไข</button>
                      <button onClick={() => handleDeleteCustomer(c)} style={{ padding: "6px 10px", backgroundColor: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>🗑️ ลบ</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ป๊อปอัพ: ประวัติการรับเงิน */}
        {showHistoryModal && selectedCustomer && (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "8px", width: "100%", maxWidth: "500px", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "2px solid #f3f4f6", paddingBottom: "10px" }}>
                <h3 style={{ margin: 0 }}>📜 ประวัติการรับชำระเงิน</h3>
                <button onClick={() => { setShowHistoryModal(false); setSelectedCustomer(null); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#9ca3af" }}>✕</button>
              </div>
              <p style={{ margin: "0 0 5px 0" }}>ลูกค้า: <strong>{selectedCustomer.name}</strong></p>
              <p style={{ margin: "0 0 15px 0", fontSize: "13px", color: "#4b5563" }}>ยอดชำระสะสมทั้งหมด: <span style={{ color: "#15803d", fontWeight: "bold" }}>{Number(selectedCustomer.paid || 0).toLocaleString()} บาท</span></p>

              {!selectedCustomer.payments || selectedCustomer.payments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#9ca3af", backgroundColor: "#f9fafb", borderRadius: "6px" }}>ยังไม่มีประวัติการเก็บเงินของลูกหนี้รายนี้</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {selectedCustomer.payments.map((log, idx) => (
                    <div key={idx} style={{ padding: "12px", backgroundColor: "#f9fafb", borderRadius: "6px", borderLeft: "4px solid #10b981", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "12px", color: "#6b7280", display: "block" }}>{log.date}</span>
                        <span style={{ fontSize: "11px", backgroundColor: "#e0f2fe", color: "#0369a1", padding: "2px 5px", borderRadius: "4px", marginTop: "4px", display: "inline-block" }}>{log.type || "รับชำระค่างวด"}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: "bold", color: "#111827", fontSize: "16px" }}>+{Number(log.amount).toLocaleString()}</span>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}> บาท</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: "20px", textAlign: "right" }}><button onClick={() => { setShowHistoryModal(false); setSelectedCustomer(null); }} style={{ padding: "8px 16px", backgroundColor: "#111827", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>ปิดหน้าต่าง</button></div>
            </div>
          </div>
        )}

        {/* ป๊อปอัพ: เพิ่มสัญญากู้ใหม่ */}
        {showAddModal && (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100 }}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "8px", width: "100%", maxWidth: "420px", margin: "10px" }}>
              <h3 style={{ marginTop: 0, borderBottom: "1px solid #e5e7eb", paddingBottom: "10px" }}>➕ ลงทะเบียนเปิดสัญญาใหม่</h3>
              <form onSubmit={handleCreateLoan}>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>ชื่อ - นามสกุล ลูกค้า</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>รูปแบบเงื่อนไขกู้</label><select value={loanType} onChange={(e) => { setLoanType(e.target.value); clearForm(); setName(name); }} style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }}><option value="daily">แบบกำหนดวันจบ (ส่งต้น+ดอกรายวัน)</option><option value="interest">แบบดอกลอย (ส่งดอกเป็นรอบๆ)</option></select></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>ยอดเงินต้นปล่อยกู้ (บาท)</label><input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>{loanType === "daily" ? "จำนวนเงินที่ต้องส่งต่อวัน (บาท)" : "ระบุจำนวนยอดดอกเบี้ยต่อรอบ (บาท)"}</label><input type="number" value={customCyclePayment} onChange={(e) => setCustomCyclePayment(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>{loanType === "daily" ? "กำหนดจำนวนวันส่งทั้งหมด (วัน)" : "ระบุระยะรอบวันตัดจ่ายดอก (เช่น ทุกๆ 7 วัน)"}</label><input type="number" value={customDays} onChange={(e) => setCustomDays(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                
                <div style={{ backgroundColor: "#f3f4f6", padding: "10px", borderRadius: "6px", marginBottom: "15px", fontSize: "13px" }}>
                  <p style={{ margin: "0 0 4px 0" }}>💡 <b>สรุปการคำนวณอัตโนมัติ:</b></p>
                  <span>{loanType === "daily" ? `ยอดรวมต้องส่งคืน: ${dynamicCalculation.total.toLocaleString()} บ. (ดอกเบี้ยรวม: ${dynamicCalculation.interest.toLocaleString()} บ.)` : `ระบบจะแจ้งเตือนให้เก็บเงินจำนวน ${dynamicCalculation.cyclePayment.toLocaleString()} บ. ทุกๆ ${dynamicCalculation.termDays} วัน`}</span>
                </div>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: "8px 15px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>ยกเลิก</button>
                  <button type="submit" style={{ padding: "8px 15px", borderRadius: "4px", border: "none", backgroundColor: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: "bold" }}>บันทึกเปิดสัญญา</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ป๊อปอัพ: แก้ไขข้อมูลสัญญา */}
        {showEditModal && (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100 }}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "8px", width: "100%", maxWidth: "420px", margin: "10px" }}>
              <h3 style={{ marginTop: 0, borderBottom: "1px solid #e5e7eb", paddingBottom: "10px" }}>✏️ แก้ไขข้อมูลสัญญา</h3>
              <form onSubmit={handleEditLoan}>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>ชื่อ - นามสกุล</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>รูปแบบกู้</label><select value={loanType} onChange={(e) => setLoanType(e.target.value)} style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }}><option value="daily">แบบกำหนดวันจบ</option><option value="interest">แบบดอกลอย</option></select></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>เงินต้น (บาท)</label><input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>ยอดส่งต่อวัน / ยอดดอกเบี้ย</label><input type="number" value={customCyclePayment} onChange={(e) => setCustomCyclePayment(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ marginBottom: "12px" }}><label style={{ fontSize: "13px", fontWeight: "bold" }}>จำนวนวันส่ง / รอบวันจ่ายดอก</label><input type="number" value={customDays} onChange={(e) => setCustomDays(e.target.value)} required style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #ccc" }} /></div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "15px" }}>
                  <button type="button" onClick={() => { setShowEditModal(false); setEditingCustomer(null); }} style={{ padding: "8px 15px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>ยกเลิก</button>
                  <button type="submit" style={{ padding: "8px 15px", borderRadius: "4px", border: "none", backgroundColor: "#f59e0b", color: "#fff", cursor: "pointer", fontWeight: "bold" }}>บันทึกการปรับปรุง</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ป๊อปอัพ: บันทึกการเก็บเงินชำระ */}
        {showPayModal && selectedCustomer && (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100 }}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "8px", width: "100%", maxWidth: "380px", margin: "10px" }}>
              <h3 style={{ marginTop: 0 }}>💵 บันทึกเงินค่างวด/ยอดเก็บดอก</h3>
              <p style={{ margin: "5px 0" }}>ลูกค้า: <b style={{ fontSize: "16px", color: "#111827" }}>{selectedCustomer.name}</b></p>
              <p style={{ margin: "0 0 15px 0", fontSize: "13px", color: "#6b7280" }}>ยอดค้างในระบบปัจจุบัน: {Number(selectedCustomer.remain || 0).toLocaleString()} บาท</p>
              <form onSubmit={handlePayment}>
                <div style={{ margin: "15px 0" }}>
                  <label style={{ fontSize: "14px", fontWeight: "bold" }}>ยอดเงินที่รับมาจริง (บาท):</label>
                  <input type="number" placeholder={`ยอดแนะนำตามแผน: ${selectedCustomer.cyclePayment} บาท`} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required style={{ width: "100%", padding: "12px", marginTop: "6px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "16px" }} />
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowPayModal(false)} style={{ padding: "8px 15px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>ยกเลิก</button>
                  <button type="submit" style={{ padding: "8px 15px", borderRadius: "4px", border: "none", backgroundColor: "#10b981", color: "#fff", cursor: "pointer", fontWeight: "bold" }}>บันทึกรับเงิน</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}