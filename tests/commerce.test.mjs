import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateProduct,normalizeCart,discountFor,canCancel} from '../js/commerce.mjs';
import {OrderFeed,orderFromDocument,mergeOrderSources,existingOrderPaths,orderVersion} from '../js/order-feed.mjs';
const product={name:'Real product',price:100,quantity:2,returnDays:7};
test('inventory rejects negative, fractional and empty quantities; preserves zero stock and return days',()=>{
 for(const quantity of [-1,1.5,'',Infinity])assert.throws(()=>validateProduct({...product,quantity}));
 assert.throws(()=>validateProduct({...product,price:-1}));
 assert.throws(()=>validateProduct({...product,returnDays:-1}));
 assert.equal(validateProduct({...product,quantity:0}).quantity,0);
 assert.equal(validateProduct(product).returnDays,7);
 assert.equal(validateProduct({...product,deliveryCharge:49.5}).deliveryCharge,49.5);
 assert.throws(()=>validateProduct({...product,deliveryCharge:-1}));
});
test('cart recovers from invalid storage and combines duplicate product quantities',()=>{
 assert.deepEqual(normalizeCart('{bad'),[]);assert.deepEqual(normalizeCart('{}'),[]);
 const result=normalizeCart([{id:'a',price:10,quantity:1},{id:'a',price:10,quantity:2},{id:'b',price:-1,quantity:1},{id:'c',price:10,quantity:-2}]);
 assert.equal(result.length,1);assert.equal(result[0].quantity,3);
});
test('discount validates ownership, limits, minimum, expiry and monetary rounding',()=>{
 const code={type:'percent',amount:10,userUID:'u',maxUses:1,usedCount:0,minOrder:100};
 assert.equal(discountFor(code,199.99,'u'),20);
 assert.throws(()=>discountFor(code,200,'other'));
 assert.throws(()=>discountFor({...code,usedCount:1},200,'u'));
 assert.throws(()=>discountFor(code,99,'u'));
 assert.throws(()=>discountFor({...code,expiresAt:'2020-01-01'},200,'u'));
 assert.equal(discountFor({type:'flat',amount:1000},100,'u'),100);
});
test('shipped and delivered orders cannot be cancelled',()=>{
 for(const orderStatus of ['Shipped','Delivered','Completed','Cancelled','Cancelled by User'])assert.equal(canCancel({orderStatus}),false);
 assert.equal(canCancel({orderStatus:'Pending'}),true);
});
function database(seed){return {data:new Map(Object.entries(structuredClone(seed))),version:0};}
async function transaction(db,callback){
 for(let retry=0;retry<10;retry++){
  const version=db.version,writes=[];
  const tx={get:async ref=>{const value=structuredClone(db.data.get(ref));return {exists:()=>value!==undefined,data:()=>value};},set:(ref,value)=>writes.push(['set',ref,structuredClone(value)]),update:(ref,value)=>writes.push(['update',ref,structuredClone(value)]),delete:ref=>writes.push(['delete',ref])};
  const result=await callback(tx);
  if(db.version!==version)continue;
  for(const [op,ref,value] of writes){if(op==='delete')db.data.delete(ref);else db.data.set(ref,op==='update'?{...db.data.get(ref),...value}:value);}db.version++;return result;
 }
 throw new Error('Transaction retry limit');
}
async function loadTransactions(file,exports){const source=(await readFile(new URL('../js/'+file,import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'').replaceAll('export async function','async function');const context={doc:(_db,...parts)=>parts.join('/'),runTransaction:transaction,serverTimestamp:()=>({seconds:1}),normalizeCart,discountFor,canCancel,existingOrderPaths,orderVersion,console};vm.createContext(context);vm.runInContext(source+'\nthis.result={'+exports.join(',')+'};',context);return context.result;}
const {createOrderWithInventory}=await loadTransactions('checkout-order.js',['createOrderWithInventory']);
const {updateOrderAtomic,deleteOrderAtomic}=await loadTransactions('order-transactions.js',['updateOrderAtomic','deleteOrderAtomic']);
const order=(id='1',quantity=1)=>({id,adminUID:'admin',userUID:'u',items:[{id:'a',name:'A',price:100,quantity}],totalAmount:100*quantity,paymentMethod:'COD',orderStatus:'Pending',restored:false});
test('failed checkout never creates partial orders or changes stock',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:1}});
 await assert.rejects(()=>createOrderWithInventory(db,order('1',2)));
 assert.equal(db.data.get('products/a').quantity,1);assert.equal(db.data.size,1);
 await assert.rejects(()=>createOrderWithInventory(db,{...order(),totalAmount:1}));
 assert.equal(db.data.size,1);
});
test('checkout includes the current product delivery charge in the verified total',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2,deliveryCharge:20}});
 const placed=await createOrderWithInventory(db,{...order('delivery-charge'),totalAmount:120},'');
 assert.equal(placed.deliveryAmount,20);assert.equal(placed.totalAmount,120);
});
test('wallet checkout debits the exact verified amount and writes a ledger entry',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2},'users/u':{walletBalance:150}});
 const placed=await createOrderWithInventory(db,{...order('wallet'),paymentMethod:'WALLET'},'');
 assert.equal(placed.totalAmount,100);assert.equal(db.data.get('users/u').walletBalance,50);
 assert.equal(db.data.get('users/u/walletTransactions/wallet').amount,100);
});
test('wallet checkout does not change stock or balance when credit is insufficient',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2},'users/u':{walletBalance:99}});
 await assert.rejects(()=>createOrderWithInventory(db,{...order('wallet-low'),paymentMethod:'WALLET'},''));
 assert.equal(db.data.get('products/a').quantity,2);assert.equal(db.data.get('users/u').walletBalance,99);
});
test('concurrent checkout cannot oversell the last unit',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:1}});
 const outcomes=await Promise.allSettled([createOrderWithInventory(db,order('1')),createOrderWithInventory(db,order('2'))]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.data.get('products/a').quantity,0);
 assert.equal([...db.data.keys()].filter(k=>k.includes('/orders/')).length,2);
});
test('concurrent checkouts cannot exceed coupon use limit',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:3},'discountCodes/ONLY1':{type:'flat',amount:10,maxUses:1,usedCount:0}});
 const outcomes=await Promise.allSettled(['1','2'].map(id=>createOrderWithInventory(db,{...order(id),totalAmount:90},'ONLY1')));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.data.get('discountCodes/ONLY1').usedCount,1);assert.equal(db.data.get('products/a').quantity,2);
});
test('cancellation restores inventory once across simultaneous admin and customer actions',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2}});const saved=await createOrderWithInventory(db,order());
 await Promise.all([updateOrderAtomic(db,saved,{orderStatus:'Cancelled'},{restore:true}),updateOrderAtomic(db,saved,{orderStatus:'Cancelled'},{restore:true})]);
 assert.equal(db.data.get('products/a').quantity,2);assert.equal(db.data.get('users/u/orders/1').restored,true);assert.equal(db.data.get('admins/admin/orders/1').restored,true);
 await assert.rejects(()=>updateOrderAtomic(db,saved,{orderStatus:'Processing'}));
});
test('payment dismissal releases inventory and coupon exactly once',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2},'discountCodes/OFFER':{type:'flat',amount:10,maxUses:1,usedCount:0}});
 const saved=await createOrderWithInventory(db,{...order(),totalAmount:90},'OFFER');
 for(let i=0;i<2;i++)await updateOrderAtomic(db,saved,{orderStatus:'Cancelled',paymentStatus:'Payment Cancelled'},{restore:true,releaseCoupon:true});
 assert.equal(db.data.get('products/a').quantity,2);assert.equal(db.data.get('discountCodes/OFFER').usedCount,0);
});
test('completing a wallet return credits the wallet once and writes a Trendora refund entry',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:1},'users/u':{walletBalance:25}});const saved=await createOrderWithInventory(db,{...order('return'),orderStatus:'Delivered',refundMode:'Trendora Wallet'});
 await Promise.all([updateOrderAtomic(db,saved,{returnStatus:'Returned'},{restore:true}),updateOrderAtomic(db,saved,{returnStatus:'Returned'},{restore:true})]);
 assert.equal(db.data.get('users/u').walletBalance,125);
 const entry=db.data.get('users/u/walletTransactions/return-return');assert.equal(entry.amount,100);assert.equal(entry.description,'Return refund · Paid by Trendora');
 assert.equal(db.data.get('users/u/orders/return').refundMode,'Trendora Wallet');
});
test('completing an original-payment return does not credit the wallet',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:1},'users/u':{walletBalance:25}});const saved=await createOrderWithInventory(db,{...order('original-return'),orderStatus:'Delivered',refundMode:'Original payment method'});
 await updateOrderAtomic(db,saved,{returnStatus:'Returned'},{restore:true});
 assert.equal(db.data.get('users/u').walletBalance,25);
 assert.equal(db.data.get('users/u/orders/original-return').refundStatus,'Original payment refund pending');
 assert.ok(db.data.get('users/u/orders/original-return').returnedAt);
});
test('active orders cannot be deleted',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2}});const saved=await createOrderWithInventory(db,order());await assert.rejects(()=>deleteOrderAtomic(db,saved));assert.ok(db.data.has('users/u/orders/1'));
});
function snapshot(path,data){return {id:path.split('/').at(-1),ref:{path},data:()=>data};}
test('document ID cannot be overwritten by a numeric, stale or malicious stored id',()=>{
 const record=orderFromDocument(snapshot('users/u/orders/123',{id:999,userUID:'wrong',_orderPaths:['admins/other/orders/123']}));
 assert.equal(record.id,'123');assert.equal(record.userUID,'u');assert.deepEqual(record._orderPaths,['users/u/orders/123']);
});
test('admin, customer and collection-group mirrors render as one order after status update',()=>{
 const feed=new OrderFeed();
 const admin=orderFromDocument(snapshot('admins/admin/orders/123',{id:123,userUID:'u',orderStatus:'Pending'}));
 const user=orderFromDocument(snapshot('users/u/orders/123',{id:'123',adminUID:'admin',orderStatus:'Pending'}));
 for(const [source,orders] of [['admin',[admin]],['user',[user]],['group',[admin,user]]])feed.replace(source,feed.begin(source),orders);
 assert.equal(feed.values().length,1);
 const changed={...admin,orderStatus:'Packed',updatedAt:'2026-10-09T10:00:00.000Z'};
 feed.replace('admin',feed.begin('admin'),[changed]);
 assert.equal(feed.values().length,1);assert.equal(feed.values()[0].orderStatus,'Packed');
 assert.equal(feed.values()[0]._orderPaths.length,2);
});
test('repeated status writes never create additional Firestore documents',async()=>{
 const db=database({'products/a':{name:'A',price:100,quantity:2}});const saved=await createOrderWithInventory(db,order());const paths=[...db.data.keys()].sort();
 for(const orderStatus of ['Confirmed','Packed','Shipped','Delivered'])await updateOrderAtomic(db,saved,{orderStatus});
 assert.deepEqual([...db.data.keys()].sort(),paths);
 assert.equal(db.data.get('users/u/orders/1').orderStatus,'Delivered');assert.equal(db.data.get('admins/admin/orders/1').orderStatus,'Delivered');assert.equal(db.data.get('products/a').quantity,1);
});
test('status update never creates a missing admin copy',async()=>{
 const db=database({'users/u/orders/1':order()});
 await updateOrderAtomic(db,{...order(),adminUID:'missing'},{orderStatus:'Packed'});
 assert.equal(db.data.size,1);assert.equal(db.data.get('users/u/orders/1').orderStatus,'Packed');
});
test('removed documents disappear once current snapshots remove all copies',()=>{
 const feed=new OrderFeed();for(const source of ['admin','user'])feed.replace(source,feed.begin(source),[{id:'1'}]);
 feed.replace('admin',feed.begin('admin'),[]);assert.equal(feed.values().length,1);
 feed.replace('user',feed.begin('user'),[]);assert.equal(feed.values().length,0);
});
test('late snapshots cannot resurrect removed sources or overwrite a newer generation',()=>{
 const feed=new OrderFeed();const old=feed.begin('admin'),latest=feed.begin('admin');
 feed.replace('admin',latest,[{id:'1',orderStatus:'Packed'}]);assert.equal(feed.replace('admin',old,[{id:'1',orderStatus:'Pending'}]),false);
 feed.remove('admin');assert.equal(feed.replace('admin',latest,[{id:'1'}]),false);assert.equal(feed.values().length,0);
});
test('distinct orders remain distinct even when products and amount match',()=>{
 assert.equal(mergeOrderSources([{orders:[order('1'),order('2')]}]).length,2);
});
test('updates synchronize existing legacy mirror paths without creating other records',async()=>{
 const input={...order(),_orderPaths:['admins/legacy/orders/1','admins/admin/orders/1','users/u/orders/1']};
 const db=database(Object.fromEntries(input._orderPaths.map(path=>[path,order()])));
 await updateOrderAtomic(db,input,{orderStatus:'Confirmed'});
 assert.equal(db.data.size,3);for(const record of db.data.values())assert.equal(record.orderStatus,'Confirmed');
});
