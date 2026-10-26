const paymentStatus = "APPROVED"
switch(paymentStatus) {
  case "APPROVED":
    { console.log("Petcare service has been confirmed");}
    
    break;
  case "PENDING":
    { console.log("Payment is being proessed");}
    
    break;
  case "DECLINED":
    { console.log("Payment is unsucessful");}   
    
    break;  
  default:
    { console.log("Payment is Invalid");}   
}
