import {doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {normalizeCart,discountFor} from './commerce.mjs';
export async function createOrderWithInventory(db,input,codeId='') {
 const cart=normalizeCart(input.items);
 if(!cart.length||cart.length!==input.items.length)throw new Error('Your shopping bag contains invalid items. Review it before checkout.');
 return runTransaction(db,async tx=>{
  const adminRef=doc(db,'admins',input.adminUID,'orders',input.id),userRef=doc(db,'users',input.userUID,'orders',input.id),walletRef=doc(db,'users',input.userUID),walletEntryRef=doc(db,'users',input.userUID,'walletTransactions',input.id);
  const existing=await tx.get(adminRef),userExisting=await tx.get(userRef),walletUser=await tx.get(walletRef);
  if(existing.exists()||userExisting.exists())throw new Error('This order reference was already used. Please try again.');
  const products=[];
  for(const item of cart){const ref=doc(db,'products',item.id);const snap=await tx.get(ref);if(!snap.exists())throw new Error(`${item.name} is no longer available.`);const product=snap.data();const price=Number(product.price);const quantity=Number(product.quantity);if(!Number.isFinite(price)||price<0)throw new Error(`${item.name} has an invalid price.`);if(price!==item.price)throw new Error(`${item.name} has a new price. Refresh your bag before ordering.`);if(!Number.isSafeInteger(quantity)||quantity<item.quantity)throw new Error(`${product.name} has only ${Math.max(0,quantity||0)} left.`);products.push({ref,product,item});}
  let coupon=null,couponRef=null,privateCouponRef=null,privateCoupon=null;
  if(codeId){couponRef=doc(db,'discountCodes',codeId);const snap=await tx.get(couponRef);if(!snap.exists())throw new Error('This discount code no longer exists.');coupon=snap.data();if(coupon.userUID){privateCouponRef=doc(db,'users',coupon.userUID,'discounts',codeId);privateCoupon=await tx.get(privateCouponRef);}}
 const items=products.map(({item,product})=>({...item,name:product.name||item.name,price:Number(product.price),deliveryCharge:Math.max(0,Number(product.deliveryCharge)||0),returnDays:Number(product.returnDays||0),imageUrl:product.imageUrl||'',imageUrls:Array.isArray(product.imageUrls)?product.imageUrls:[]}));
  const subtotal=Math.round(items.reduce((sum,item)=>sum+item.price*item.quantity,0)*100)/100;
 const deliveryAmount=Math.round(items.reduce((sum,item)=>sum+item.deliveryCharge*item.quantity,0)*100)/100;
  const discount=discountFor(coupon,subtotal,input.userUID);
 if(Math.round((subtotal-discount+deliveryAmount)*100)!==Math.round(Number(input.totalAmount)*100))throw new Error('Your order total changed. Review the price, delivery and discount before trying again.');
 const totalAmount=Math.round((subtotal-discount+deliveryAmount)*100)/100;
 if(input.paymentMethod==='WALLET'){
   const balance=Math.max(0,Number(walletUser.data()?.walletBalance||0));
   if(balance<totalAmount)throw new Error('Your Trendora Wallet balance is not enough for this order.');
   tx.update(walletRef,{walletBalance:Math.round((balance-totalAmount)*100)/100,walletUpdatedAt:serverTimestamp()});
   tx.set(walletEntryRef,{type:'debit',amount:totalAmount,balanceAfter:Math.round((balance-totalAmount)*100)/100,orderId:input.id,description:`Order #${input.id}`,createdAt:serverTimestamp()});
 }
 const order={...input,items,subtotalAmount:subtotal,deliveryAmount,discountAmount:discount,totalAmount,discountCode:codeId,discountReserved:!!coupon,timestamp:serverTimestamp()};
  for(const {ref,product,item} of products)tx.update(ref,{quantity:Number(product.quantity)-item.quantity});
  if(coupon){const update={usedCount:Number(coupon.usedCount||0)+1,lastUsedAt:serverTimestamp(),lastOrderId:input.id};tx.update(couponRef,update);if(privateCoupon?.exists())tx.update(privateCouponRef,update);}
  tx.set(adminRef,order);tx.set(userRef,order);
  return order;
 });
}
