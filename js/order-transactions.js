import {doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {canCancel} from './commerce.mjs';
import {existingOrderPaths,orderVersion} from './order-feed.mjs';
// Both existing order copies and stock change together. Concurrent retries cannot double-restock.
export async function updateOrderAtomic(db,order,updates,{restore=false,customerCancel=false,releaseCoupon=false,refundWalletPayment=false}={}) {
 const paths=existingOrderPaths(order);
 if(!paths.length) throw new Error('This order has no valid owner.');
 return runTransaction(db,async tx=>{
  const copies=[];for(const path of paths){const ref=doc(db,...path);const snap=await tx.get(ref);if(snap.exists())copies.push({ref,data:snap.data()});}
  if(!copies.length)throw new Error('This order no longer exists.');
  const latest=[...copies].sort((a,b)=>orderVersion(b.data)-orderVersion(a.data))[0].data;
  if(customerCancel&&!canCancel(latest))throw new Error('This order can no longer be cancelled.');
  if(updates.orderStatus&&!['Cancelled','Cancelled by User'].includes(updates.orderStatus)&&copies.some(c=>['Cancelled','Cancelled by User'].includes(c.data.orderStatus)))throw new Error('Cancelled orders cannot be reopened. Place a new order instead.');
  if(updates.returnStatus === 'Requested' && (!['Delivered','Completed'].includes(latest.orderStatus) || latest.returnStatus))throw new Error('This order is not eligible for a new return request.');
  const completingReturn=updates.returnStatus==='Returned'&&latest.returnStatus!=='Returned';
  const refundMode=latest.refundMode||order.refundMode||'Trendora Wallet';
  const refundToWallet=completingReturn&&refundMode==='Trendora Wallet';
  let walletRefund=null;
  let walletWrite=null;
  if(refundToWallet){
   const ownerUID=paths.find(path=>path[0]==='users')?.[1]||latest.userUID||order.userUID;
   if(!ownerUID)throw new Error('This return has no wallet owner.');
   const refundAmount=Math.round(Math.max(0,Number(latest.totalAmount||0))*100)/100;
   const walletRef=doc(db,'users',ownerUID),walletEntryRef=doc(db,'users',ownerUID,'walletTransactions',`return-${order.id}`);
   const [walletSnap,walletEntrySnap]=await Promise.all([tx.get(walletRef),tx.get(walletEntryRef)]);
   if(!walletEntrySnap.exists()){
    const balance=Math.max(0,Number(walletSnap.data()?.walletBalance||0));
    const balanceAfter=Math.round((balance+refundAmount)*100)/100;
    walletWrite={walletRef,walletEntryRef,refundAmount,balanceAfter};
    walletRefund={amount:refundAmount,balanceAfter};
   }
  }
  let walletPaymentReversal=null;
  if(refundWalletPayment&&!latest.walletPaymentReversed&&Number(latest.walletAmount||0)>0){
   const ownerUID=paths.find(path=>path[0]==='users')?.[1]||latest.userUID||order.userUID;
   if(!ownerUID)throw new Error('This payment has no wallet owner.');
   const amount=Math.round(Math.max(0,Number(latest.walletAmount||0))*100)/100;
   const walletRef=doc(db,'users',ownerUID),walletEntryRef=doc(db,'users',ownerUID,'walletTransactions',`payment-reversal-${order.id}`);
   const [walletSnap,walletEntrySnap]=await Promise.all([tx.get(walletRef),tx.get(walletEntryRef)]);
   if(!walletEntrySnap.exists()){
    const balance=Math.max(0,Number(walletSnap.data()?.walletBalance||0));
    walletPaymentReversal={walletRef,walletEntryRef,amount,balanceAfter:Math.round((balance+amount)*100)/100};
   }
  }
  const couponWrites=[];
  if(releaseCoupon && latest.discountReserved && latest.discountCode){
    const ref=doc(db,'discountCodes',latest.discountCode);const snap=await tx.get(ref);
    if(snap.exists()){const coupon=snap.data();couponWrites.push({ref,usedCount:Math.max(0,Number(coupon.usedCount||0)-1)});if(coupon.userUID){const privateRef=doc(db,'users',coupon.userUID,'discounts',latest.discountCode);const privateSnap=await tx.get(privateRef);if(privateSnap.exists())couponWrites.push({ref:privateRef,usedCount:Math.max(0,Number(coupon.usedCount||0)-1)});}}
  }
  const restored=copies.some(c=>c.data.restored===true);
  const stock=[];
  if(restore&&!restored){
   const amounts=new Map();for(const item of latest.items||[]){const qty=Number(item.quantity);if(item.id&&Number.isSafeInteger(qty)&&qty>0)amounts.set(item.id,(amounts.get(item.id)||0)+qty);}
   for(const [id,quantity] of amounts){const ref=doc(db,'products',id);const snap=await tx.get(ref);if(snap.exists())stock.push({ref,quantity:Number(snap.data().quantity||0)+quantity});}
  }
  const stamped={...updates,updatedAt:new Date().toISOString(),...(completingReturn?{refundMode,returnedAt:new Date().toISOString(),refundStatus:refundToWallet?'Wallet credited':'Original payment refund pending',...(refundToWallet?{walletRefundedAt:new Date().toISOString(),walletRefundAmount:walletRefund?.amount??Math.round(Math.max(0,Number(latest.totalAmount||0))*100)/100}:{})}:{}),...(restore?{restored:true}:{}),...(releaseCoupon?{discountReserved:false}:{}),...(walletPaymentReversal?{walletPaymentReversed:true,walletPaymentReversedAt:new Date().toISOString()}: {})};
  if(walletWrite){
   tx.set(walletWrite.walletRef,{walletBalance:walletWrite.balanceAfter,walletUpdatedAt:serverTimestamp()},{merge:true});
   tx.set(walletWrite.walletEntryRef,{type:'credit',amount:walletWrite.refundAmount,balanceAfter:walletWrite.balanceAfter,orderId:order.id,description:'Return refund · Paid by Trendora',source:'trendora',createdAt:serverTimestamp()});
  }
  if(walletPaymentReversal){
   tx.set(walletPaymentReversal.walletRef,{walletBalance:walletPaymentReversal.balanceAfter,walletUpdatedAt:serverTimestamp()},{merge:true});
   tx.set(walletPaymentReversal.walletEntryRef,{type:'credit',amount:walletPaymentReversal.amount,balanceAfter:walletPaymentReversal.balanceAfter,orderId:order.id,description:'Payment reversal · Online payment not completed',source:'trendora',createdAt:serverTimestamp()});
  }
  for(const coupon of couponWrites)tx.update(coupon.ref,{usedCount:coupon.usedCount});
  for(const product of stock)tx.update(product.ref,{quantity:product.quantity});
  for(const copy of copies)tx.update(copy.ref,stamped);
  return stamped;
 });
}
export async function deleteOrderAtomic(db,order){
 const paths=existingOrderPaths(order);
 await runTransaction(db,async tx=>{const copies=[];for(const path of paths){const ref=doc(db,...path);const snap=await tx.get(ref);if(snap.exists())copies.push({ref,data:snap.data()});}for(const copy of copies){if(!['Cancelled','Cancelled by User','Completed','Delivered'].includes(copy.data.orderStatus))throw new Error('Cancel or complete this order before deleting it.');if(['Cancelled','Cancelled by User'].includes(copy.data.orderStatus)&&!copy.data.restored)throw new Error('Restore this cancelled order’s inventory before deleting it.');}for(const copy of copies)tx.delete(copy.ref);});
}
