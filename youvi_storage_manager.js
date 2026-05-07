/* 
   Youvi Player - Copyright (C) 2026 Yuvisite 
   This program is free software: you can redistribute it and/or modify 
   it under the terms of the GNU General Public License as published by 
   the Free Software Foundation, either version 3 of the License, or 
   (at your option) any later version. 
  
   This program is distributed in the hope that it will be useful, 
   but WITHOUT ANY WARRANTY; without even the implied warranty of 
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
   GNU General Public License for more details. 
  
   You should have received a copy of the GNU General Public License 
   along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
'use strict';

class YouviStorageManager {
	constructor(dbName = 'youvi-storage', storeName = 'items') {
		this.dbName = dbName;
		this.storeName = storeName;
		this.db = null;
	}

	async open() {
		if (this.db) return this.db;
		this.db = await new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName, { keyPath: 'key' });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return this.db;
	}

	async get(key) {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readonly');
			const store = tx.objectStore(this.storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result ? request.result.value : null);
			request.onerror = () => reject(request.error);
		});
	}

	async set(key, value) {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readwrite');
			const store = tx.objectStore(this.storeName);
			store.put({ key, value, updatedAt: Date.now() });
			tx.oncomplete = () => resolve(true);
			tx.onerror = () => reject(tx.error);
		});
	}

	async delete(key) {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readwrite');
			const store = tx.objectStore(this.storeName);
			store.delete(key);
			tx.oncomplete = () => resolve(true);
			tx.onerror = () => reject(tx.error);
		});
	}

	async list(prefix = '') {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readonly');
			const store = tx.objectStore(this.storeName);
			const request = store.getAll();
			request.onsuccess = () => {
				const items = (request.result || [])
					.filter(item => item.key.startsWith(prefix))
					.map(item => ({ key: item.key, value: item.value, updatedAt: item.updatedAt || 0 }));
				resolve(items);
			};
			request.onerror = () => reject(request.error);
		});
	}
}

window.YouviStorageManager = YouviStorageManager;
