import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-6">
      <Image
        src="/images/logo/aim-logo.png"
        alt="AIM Technologies"
        width={180}
        height={56}
        priority
      />
      <SignUp routing="path" path="/signup" signInUrl="/signin" forceRedirectUrl="/" />
    </div>
  );
}
