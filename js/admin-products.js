import {auth,db} from './firebase-client.js';
import {onAuthStateChanged,setPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {collection,onSnapshot,collectionGroup,doc,addDoc,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {escapeHTML,validateProduct} from './commerce.mjs';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'});
let products=[],editingId=null,previewURLs=[],unsubscribers=[];
const fields={name:$('pname'),price:$('pprice'),quantity:$('pquantity'),returnDays:$('preturnDays'),description:$('pdesc'),category:$('pcategory'),featured:$('pfeatured')};
const imagesFor=p=>Array.isArray(p.imageUrls)&&p.imageUrls.filter(Boolean).length?p.imageUrls.filter(Boolean):p.imageUrl?[p.imageUrl]:[];
function message(text,error=false){$('productFormMessage').textContent=text;$('productFormMessage').classList.toggle('error',error);}
function preview(urls){previewURLs.forEach(URL.revokeObjectURL);previewURLs=[];$('preview').replaceChildren();for(const url of urls){const img=document.createElement('img');img.src=url;img.alt='Selected product photo';$('preview').appendChild(img);}$('preview').style.display=urls.length?'grid':'none';}
function reset(){editingId=null;Object.values(fields).forEach(f=>f.type==='checkbox'?f.checked=false:f.value='');$('pimage').value='';preview([]);$('formTitle').textContent='Add product';$('addBtn').textContent='Add product';$('cancelEditBtn').hidden=true;}
function edit(product){editingId=product.id;for(const [key,field] of Object.entries(fields)){if(field.type==='checkbox')field.checked=product[key]===true;else field.value=product[key]??'';}$('pimage').value='';preview(imagesFor(product));$('formTitle').textContent='Edit product';$('addBtn').textContent='Save changes';$('cancelEditBtn').hidden=false;message('Editing '+product.name+'. Existing photos stay unless you choose new ones.');fields.name.scrollIntoView({behavior:'smooth',block:'center'});fields.name.focus();}
function render(){
 const q=$('inventorySearch').value.trim().toLowerCase(),filter=$('inventoryFilter').value;
 const list=products.filter(p=>(p.name+' '+(p.category||'')).toLowerCase().includes(q)).filter(p=>filter==='all'||(filter==='available'&&p.quantity>0)||(filter==='low'&&p.quantity>0&&p.quantity<=5)||(filter==='out'&&!(p.quantity>0)));
 $('inventoryCount').textContent=`${list.length} of ${products.length} products`;$('productCount').textContent=products.length;$('productList').setAttribute('aria-busy','false');
 $('productList').innerHTML=list.length?'':'<div class="empty">No products match your filters.</div>';
 for(const p of list){const row=document.createElement('article');row.className='product-card inventory-row';const image=imagesFor(p)[0];row.innerHTML=`<div class="inventory-photo">${image?`<img src="${escapeHTML(image)}" alt="${escapeHTML(p.name)}">`:'<span>No photo</span>'}</div><div class="inventory-info"><span class="inventory-category">${escapeHTML(p.category||'Uncategorized')}${p.featured?' · Featured':''}</span><h3>${escapeHTML(p.name||'Untitled product')}</h3><p>${money.format(Number(p.price||0))} <span class="stock-pill ${Number(p.quantity)<=5?'low':''}">${Number(p.quantity||0)} in stock</span></p><p class="inventory-description">${escapeHTML(p.description||'No description added.')}</p><div class="actions"><button class="btn secondary editBtn" type="button">Edit product</button><a class="catalog-preview" href="product-details.html?id=${encodeURIComponent(p.id)}">View in store ↗</a><button class="deleteBtn" type="button" aria-label="Delete ${escapeHTML(p.name)}">Delete</button></div></div>`;
 row.querySelector('.editBtn').onclick=()=>edit(p);
 row.querySelector('.deleteBtn').onclick=async event=>{if(!await window.trendoraDialog.confirm(`Delete “${p.name}” from the catalog? Existing order records will remain.`))return;const btn=event.currentTarget;btn.disabled=true;try{await deleteDoc(doc(db,'products',p.id));if(editingId===p.id)reset();message('Product deleted.');}catch(e){message('Could not delete product: '+e.message,true);btn.disabled=false;}};
 $('productList').appendChild(row);
 }
}
$('inventorySearch').addEventListener('input',render);$('inventoryFilter').addEventListener('change',render);$('cancelEditBtn').onclick=()=>{reset();message('Edit cancelled.');};
$('pimage').addEventListener('change',()=>{preview([]);const files=[...$('pimage').files];if(files.length>6||files.some(f=>!f.type.startsWith('image/')||f.size>8*1024*1024)){message('Choose up to 6 images, no larger than 8 MB each.',true);$('pimage').value='';return;}const urls=files.map(URL.createObjectURL);preview(urls);previewURLs=urls;});
$('addBtn').addEventListener('click',async()=>{
 if($('addBtn').disabled)return;
 try{
  const payload=validateProduct(Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.type==='checkbox'?field.checked:field.value])));
  const files=[...$('pimage').files];if(!editingId&&!files.length)throw new Error('Add at least one actual product photo.');
  if(files.length>6||files.some(f=>!f.type.startsWith('image/')||f.size>8*1024*1024))throw new Error('Choose up to 6 images, no larger than 8 MB each.');
  $('addBtn').disabled=true;$('cancelEditBtn').disabled=true;message(files.length?'Uploading product photos…':'Saving product…');
  const urls=await Promise.all(files.map(async file=>{const data=new FormData();data.append('file',file);data.append('upload_preset','unsigned_upload');const response=await fetch('https://api.cloudinary.com/v1_1/dwz1jxty5/image/upload',{method:'POST',body:data});const result=await response.json();if(!response.ok||!result.secure_url)throw new Error(result.error?.message||'Photo upload failed.');return result.secure_url;}));
  if(urls.length){payload.imageUrls=urls;payload.imageUrl=urls[0];}
  if(editingId)await updateDoc(doc(db,'products',editingId),payload);else await addDoc(collection(db,'products'),{...payload,createdAt:serverTimestamp()});
  reset();message('Product saved. Your storefront is up to date.');
 }catch(e){message(e.message||'Could not save product.',true);}finally{$('addBtn').disabled=false;$('cancelEditBtn').disabled=false;}
});
await setPersistence(auth,browserSessionPersistence);
onAuthStateChanged(auth,user=>{
 unsubscribers.forEach(stop=>stop());unsubscribers=[];
 if(!user||user.email?.toLowerCase()!=='anshbajpai3@gmail.com'){location.replace('admin-login.html');return;}
 unsubscribers.push(onSnapshot(collection(db,'products'),snapshot=>{products=snapshot.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));$('lowStockCount').textContent=products.filter(product=>Number(product.quantity||0)<=5).length;render();},error=>{$('productList').setAttribute('aria-busy','false');$('productList').innerHTML='<div class="empty">Could not load inventory. Reload to try again.</div>';message(error.message,true);}));
 unsubscribers.push(onSnapshot(collection(db,'users'),snapshot=>$('userCount').textContent=snapshot.size,()=>{$('userCount').textContent='—';}));
 unsubscribers.push(onSnapshot(collection(db,'discountCodes'),snapshot=>{const codes=snapshot.docs.map(d=>d.data());$('activeCodeCount').textContent=codes.filter(c=>c.status!=='disabled'&&(!c.expiresAt||new Date(c.expiresAt+'T23:59:59+05:30')>=new Date())&&(!c.maxUses||Number(c.usedCount||0)<Number(c.maxUses))).length;$('redemptionCount').textContent=codes.reduce((n,c)=>n+Number(c.usedCount||0),0);},()=>{$('activeCodeCount').textContent='—';$('redemptionCount').textContent='—';}));
 unsubscribers.push(onSnapshot(collectionGroup(db,'orders'),snapshot=>{
  const canonical=new Map();
  snapshot.docs.filter(d=>d.ref.path.startsWith('admins/')).forEach(d=>{const order={id:d.id,...d.data()};const prior=canonical.get(order.id);const newer=Date.parse(order.updatedAt||order.statusUpdatedAt||0)||0;if(!prior||newer>(Date.parse(prior.updatedAt||prior.statusUpdatedAt||0)||0))canonical.set(order.id,order);});
  const orders=[...canonical.values()];const open=orders.filter(order=>!['Cancelled','Cancelled by User','Delivered','Completed'].includes(order.orderStatus||'Pending'));
  $('openOrderCount').textContent=open.length;
  $('orderValue').textContent=money.format(orders.filter(order=>!['Cancelled','Cancelled by User'].includes(order.orderStatus||'')).reduce((sum,order)=>sum+Number(order.totalAmount||0),0));
 },()=>{$('openOrderCount').textContent='—';$('orderValue').textContent='—';}));
});
