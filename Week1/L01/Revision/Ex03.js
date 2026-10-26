const payments = [
    {petName: "Chester",amount: 50,status: "APPROVED"},
    {petName: "Mochi",amount: 80,status: "PENDING"},
    {petName: "Mira",amount: 40,status: "DECLINED"}
];

console.log("Mochi's payment status: " + payments[1].status);

for (const payment of payments) {
    if (payment.status === "APPROVED") 
    { console.log("Petcare service for" + payment.petName +  "is confirmed");}
    else if (payment.status === "PENDING") 
    { console.log("Payment service for "+ payment.petName + "is being proessed");}
    else if (payment.status === "DECLINED") 
    { console.log("Payment service for" + payment.petName +  "is unsucessful");} 
}