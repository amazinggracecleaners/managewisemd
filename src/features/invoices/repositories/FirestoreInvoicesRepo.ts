// src/features/invoices/repositories/FirestoreInvoicesRepo.ts
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  type Firestore,
} from "firebase/firestore";
import type { Invoice } from "@/shared/types/domain";
import type { InvoicesRepo } from "./types";
import mitt from "mitt";

export class FirestoreInvoicesRepo implements InvoicesRepo {
  private bus = mitt<{ change: Invoice[] }>();

  constructor(private db: Firestore) {}

  onChange(fn: (list: Invoice[]) => void) {
    this.bus.on("change", fn);
    return () => this.bus.off("change", fn);
  }

  watchAll({ companyId }: { companyId: string }) {
    const colRef = collection(this.db, "companies", companyId, "invoices");

    return onSnapshot(
      colRef,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
        this.bus.emit("change", rows);
      },
      (err) => {
        console.error("[FirestoreInvoicesRepo] watchAll failed:", err);
      }
    );
  }

  async create(companyId: string, data: Omit<Invoice, "id">): Promise<Invoice> {
    const ref = doc(collection(this.db, "companies", companyId, "invoices"));
    const payload: Invoice = { ...data, id: ref.id };
    await setDoc(ref, payload);
    return payload;
  }

  update(companyId: string, id: string, patch: Partial<Invoice>) {
    return updateDoc(doc(this.db, "companies", companyId, "invoices", id), patch);
  }

  remove(companyId: string, id: string) {
    return deleteDoc(doc(this.db, "companies", companyId, "invoices", id));
  }
}

export class LocalInvoicesRepo implements InvoicesRepo {
  private key = "timewise.v1.invoices";
  private bus = mitt<{ change: Invoice[] }>();

  private read(): Invoice[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "[]");
    } catch {
      return [];
    }
  }

  private write(v: Invoice[]) {
    try {
      localStorage.setItem(this.key, JSON.stringify(v));
      this.bus.emit("change", v);
    } catch (e) {
      console.error(e);
    }
  }

  onChange(fn: (list: Invoice[]) => void) {
    this.bus.on("change", fn);
    return () => this.bus.off("change", fn);
  }

  watchAll() {
    setTimeout(() => this.bus.emit("change", this.read()), 5);
    return () => {};
  }

  async create(_companyId: string, data: Omit<Invoice, "id">) {
    const v = this.read();
    const row = { ...data, id: String(Date.now()) } as Invoice;
    this.write([...v, row]);
    return row;
  }

  async update(_companyId: string, id: string, patch: Partial<Invoice>) {
    const v = this.read().map((x) => (x.id === id ? ({ ...x, ...patch } as Invoice) : x));
    this.write(v);
  }

  async remove(_companyId: string, id: string) {
    const v = this.read().filter((x) => x.id !== id);
    this.write(v);
  }
}
