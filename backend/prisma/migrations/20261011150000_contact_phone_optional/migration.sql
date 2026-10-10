-- A contact needs a phone number or an email; the phone is no longer required.
ALTER TABLE "Contact" ALTER COLUMN "phoneNumber" DROP NOT NULL;
